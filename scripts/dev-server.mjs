#!/usr/bin/env node
/**
 * 开发服务器：构建演示游戏 → 放进静态目录 → 起 Vite。
 *
 * 工作区里还可以有其他游戏（`hearthbox-projects/` 下与平台平级的目录），
 * 它们由下面的网关提供，不复制进平台仓库。
 */
import { spawn } from 'node:child_process';
import { createServer, request as httpRequest } from 'node:http';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { extname, join, normalize, resolve, sep, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const workspaceRoot = resolve(root, '..');
const PORT = 5199;
const VITE_PORT = 5200;

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

/** 扫工作区里与平台平级的游戏目录。每次请求都重扫，加游戏不用重启。 */
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
      games.push({
        name: entry.name,
        dir,
        manifest: JSON.parse(readFileSync(manifestPath, 'utf8')),
      });
    } catch {
      // 清单坏了就跳过，别让一个坏游戏拖垮整个货架。
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
    base: `/play/${game.name}`,
  };
}

function safeJoin(base, sub) {
  const target = resolve(base, normalize(sub));
  return target.startsWith(base + sep) || target === base ? target : null;
}

function builtinShelf() {
  const path = join(root, 'apps/shell/public/demo/game.json');
  if (!existsSync(path)) return [];
  try {
    const manifest = JSON.parse(readFileSync(path, 'utf8'));
    return [
      {
        id: manifest.id,
        name: manifest.name,
        summary: manifest.summary,
        inputs: Array.isArray(manifest.input) ? manifest.input : ['pad'],
        base: '/demo',
      },
    ];
  } catch {
    return [];
  }
}

/** 只处理 /play/ 与 /shelf.json 的网关，其余转给 Vite。 */
function createGateway() {
  return createServer((req, res) => {
    const url = req.url?.split('?')[0] ?? '';
    const games = discoverGames();

    // 货架清单：内置演示游戏 + 工作区里的其他游戏
    if (url === '/shelf.json') {
      const entries = [...builtinShelf(), ...games.map(shelfEntry)];
      res.setHeader('Content-Type', MIME['.json']);
      res.setHeader('Cache-Control', 'no-store');
      res.end(JSON.stringify({ games: entries }, null, 2));
      return;
    }

    if (url.startsWith('/play/')) {
      const rest = url.slice('/play/'.length);
      const slash = rest.indexOf('/');
      if (slash > 0) {
        const name = rest.slice(0, slash);
        const game = games.find((candidate) => candidate.name === name);
        if (game) {
          const sub = decodeURIComponent(rest.slice(slash + 1));
          const candidates =
            sub === 'game.json'
              ? [join(game.dir, 'game.json')]
              : [join(game.dir, 'dist', sub), join(game.dir, sub)];

          for (const candidate of candidates) {
            const safe = safeJoin(game.dir, candidate.slice(game.dir.length + 1));
            if (safe && existsSync(safe) && statSync(safe).isFile()) {
              const type = MIME[extname(safe).toLowerCase()] ?? 'application/octet-stream';
              res.setHeader('Content-Type', type);
              res.setHeader('Cache-Control', 'no-store');
              res.end(readFileSync(safe));
              return;
            }
          }

          res.statusCode = 404;
          res.end(`未找到：${url}`);
          return;
        }
      }
    }

    const proxy = httpRequest(
      {
        hostname: '127.0.0.1',
        port: VITE_PORT,
        path: req.url,
        method: req.method,
        headers: req.headers,
      },
      (upstream) => {
        res.writeHead(upstream.statusCode ?? 502, upstream.headers);
        upstream.pipe(res);
      },
    );
    proxy.on('error', () => {
      res.statusCode = 502;
      res.end('Vite 未就绪');
    });
    req.pipe(proxy);
  });
}

try {
  await run('pnpm', ['--filter', '@hearthbox/demo', 'build']);
  await run('node', ['scripts/build-demo.mjs']);
} catch (error) {
  console.error('[dev] 演示游戏构建失败，Vite 不会启动');
  console.error(error);
  process.exit(1);
}

const vite = spawn(
  'pnpm',
  ['--filter', '@hearthbox/shell', 'dev', '--port', String(VITE_PORT), '--strictPort'],
  { cwd: root, stdio: 'inherit', shell: process.platform === 'win32' },
);

const gateway = createGateway();
gateway.listen(PORT, '127.0.0.1', () => {
  const games = discoverGames();
  console.log(`\n  ▶ 炉边  http://127.0.0.1:${PORT}/`);
  console.log(`    演示游戏 1 个${games.length > 0 ? `，工作区游戏 ${games.length} 个` : ''}`);
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
