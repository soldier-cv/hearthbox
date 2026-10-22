#!/usr/bin/env node
/**
 * 开发服务器：构建平台夹具 → 把工作区里的游戏挂进货架 → 起 Vite。
 *
 * 工作区布局（游戏不进平台仓库，见 D12）：
 *
 *   hearthbox-projects/
 *     hearthbox/       平台
 *     my-game/         游戏：game.json + dist/game.js
 *
 * 游戏怎么被看见：Vite 的 public 目录只放平台夹具。工作区游戏由一个
 * **前置的 HTTP 中间件**提供——它比 Vite 的 SPA 回退更早拿到请求，
 * 因此不需要改壳的源码，也不需要把游戏文件复制进平台仓库。
 */
import { spawn } from 'node:child_process';
import { createServer, request as httpRequest } from 'node:http';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { extname, join, normalize, resolve, sep } from 'node:path';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const workspaceRoot = resolve(root, '..');
const PORT = 5199;

const MIME = {
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.ogg': 'audio/ogg',
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav',
  '.txt': 'text/plain; charset=utf-8',
};

function run(command, args) {
  return new Promise((resolveRun, reject) => {
    const child = spawn(command, args, {
      cwd: root,
      stdio: 'inherit',
      shell: process.platform === 'win32',
    });
    child.on('error', reject);
    child.on('exit', (code) => {
      if (code === 0) resolveRun();
      else reject(new Error(`${command} ${args.join(' ')} 退出码 ${code}`));
    });
  });
}

/** 扫描工作区根下带 game.json 且已 build 的目录。每次请求都重扫，加游戏不用重启。 */
function discoverGames() {
  const games = [];
  let entries;
  try {
    entries = readdirSync(workspaceRoot, { withFileTypes: true });
  } catch {
    return games;
  }

  for (const entry of entries) {
    if (!entry.isDirectory() || entry.name.startsWith('.')) continue;
    if (entry.name === 'hearthbox' || entry.name === 'node_modules') continue;

    const dir = join(workspaceRoot, entry.name);
    const manifestPath = join(dir, 'game.json');
    if (!existsSync(manifestPath)) continue;
    if (!existsSync(join(dir, 'dist', 'game.js'))) continue;

    try {
      const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
      games.push({ name: entry.name, dir, manifest });
    } catch {
      // 清单坏了就跳过，不要让一个坏游戏拖垮整个货架。
    }
  }

  return games.sort((a, b) => a.name.localeCompare(b.name));
}

function shelfEntry(game) {
  const manifest = game.manifest;
  return {
    id: String(manifest.id ?? game.name),
    name: String(manifest.name ?? game.name),
    summary: String(manifest.summary ?? manifest.id ?? game.name),
    inputs: Array.isArray(manifest.input) ? manifest.input : ['pad'],
    entry: 'game.js',
    manifest: 'game.json',
    base: `/fixtures/${game.name}`,
  };
}

function safeJoin(base, sub) {
  const target = resolve(base, normalize(sub));
  return target.startsWith(base + sep) || target === base ? target : null;
}

function platformShelf() {
  const path = join(root, 'apps/shell/public/fixtures/index.json');
  if (!existsSync(path)) return [];
  try {
    const parsed = JSON.parse(readFileSync(path, 'utf8'));
    return Array.isArray(parsed.fixtures) ? parsed.fixtures : [];
  } catch {
    return [];
  }
}

/** 起一个只处理 /fixtures/ 的代理，其余全部转给 Vite。 */
function createGateway(vitePort) {
  return createServer((request, response) => {
    const url = request.url?.split('?')[0] ?? '';
    const games = discoverGames();

    if (url === '/fixtures/index.json') {
      const fixtures = [...platformShelf(), ...games.map(shelfEntry)];
      response.setHeader('Content-Type', MIME['.json']);
      response.setHeader('Cache-Control', 'no-store');
      response.end(JSON.stringify({ fixtures }, null, 2));
      return;
    }

    if (url.startsWith('/fixtures/')) {
      const rest = url.slice('/fixtures/'.length);
      const slash = rest.indexOf('/');
      if (slash > 0) {
        const name = rest.slice(0, slash);
        const game = games.find((candidate) => candidate.name === name);
        if (game) {
          const sub = decodeURIComponent(rest.slice(slash + 1));
          // game.json 在包根，game.js 与 assets/* 在 dist/ 或包根下。
          const candidates =
            sub === 'game.json'
              ? [join(game.dir, 'game.json')]
              : [join(game.dir, 'dist', sub), join(game.dir, sub)];

          for (const candidate of candidates) {
            const safe = safeJoin(game.dir, candidate.slice(game.dir.length + 1));
            if (safe && existsSync(safe) && statSync(safe).isFile()) {
              response.setHeader(
                'Content-Type',
                MIME[extname(safe).toLowerCase()] ?? 'application/octet-stream',
              );
              response.setHeader('Cache-Control', 'no-store');
              response.end(readFileSync(safe));
              return;
            }
          }

          response.statusCode = 404;
          response.end(`未找到：${url}`);
          return;
        }
      }
    }

    // 其余请求转给 Vite。
    const proxy = httpRequest(
      {
        hostname: '127.0.0.1',
        port: vitePort,
        path: request.url,
        method: request.method,
        headers: request.headers,
      },
      (upstream) => {
        response.writeHead(upstream.statusCode ?? 502, upstream.headers);
        upstream.pipe(response);
      },
    );
    proxy.on('error', () => {
      response.statusCode = 502;
      response.end('Vite 未就绪');
    });
    request.pipe(proxy);
  });
}

try {
  await run('pnpm', ['--filter', '@hearthbox/fixture-contract', 'build']);
  await run('pnpm', ['--filter', '@hearthbox/fixture-inputs', 'build']);
  await run('node', ['scripts/link-fixtures.mjs']);
} catch (error) {
  console.error('[dev-server] 夹具构建失败，Vite 不会启动');
  console.error(error);
  process.exit(1);
}

const VITE_PORT = 5200;

const vite = spawn(
  'pnpm',
  ['--filter', '@hearthbox/shell', 'dev', '--port', String(VITE_PORT), '--strictPort'],
  {
    cwd: root,
    stdio: 'inherit',
    shell: process.platform === 'win32',
  },
);

const gateway = createGateway(VITE_PORT);
gateway.listen(PORT, '127.0.0.1', () => {
  const games = discoverGames();
  console.log(`\n  ▶ Hearthbox  http://127.0.0.1:${PORT}/`);
  console.log(`    平台夹具 ${platformShelf().length} 个，工作区游戏 ${games.length} 个`);
  for (const game of games) console.log(`      · ${game.name}`);
  console.log('');
});

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => {
    vite.kill(signal);
    gateway.close();
    process.exit(0);
  });
}

vite.on('exit', (code) => {
  gateway.close();
  process.exit(code ?? 0);
});
