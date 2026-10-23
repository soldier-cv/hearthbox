#!/usr/bin/env node
/**
 * 最小 `.hbx` 打包器。
 *
 * 用法：node scripts/pack-game.mjs <游戏目录> [输出.hbx]
 *
 * 只做导入需要的校验：清单、单文件入口、素材路径与类型、体积。
 * 签名、catalog 和发布不在这一步。
 */
import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { extname, join, relative, resolve, sep } from 'node:path';
import { strToU8, zipSync } from 'fflate';

const MAX_BYTES = 200 * 1024 * 1024;
const MAX_FILES = 4000;
const MEDIA = new Set(['png', 'jpg', 'webp', 'gif', 'json', 'txt', 'ogg', 'mp3', 'wav']);

const input = process.argv[2];
if (!input) {
  console.error('用法：node scripts/pack-game.mjs <游戏目录> [输出.hbx]');
  process.exit(1);
}

const gameDir = resolve(input);
const manifestPath = join(gameDir, 'game.json');
if (!existsSync(manifestPath)) {
  console.error(`找不到 ${manifestPath}`);
  process.exit(1);
}

let manifest;
try {
  manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
} catch (cause) {
  console.error(`game.json 不是合法 JSON：${cause.message}`);
  process.exit(1);
}

for (const field of ['id', 'name', 'version', 'sdk', 'entry', 'display', 'players', 'license']) {
  if (manifest[field] === undefined) {
    console.error(`game.json 缺少 ${field}`);
    process.exit(1);
  }
}
if (manifest.entry !== 'game.js') {
  console.error('game.json 的 entry 必须是 game.js');
  process.exit(1);
}
if (!/^[a-z0-9][a-z0-9-]*\.[a-z0-9][a-z0-9-]*$/.test(String(manifest.id))) {
  console.error('game.json 的 id 必须是小写点分，如 me.my-game');
  process.exit(1);
}

const entryPath = existsSync(join(gameDir, 'dist', 'game.js'))
  ? join(gameDir, 'dist', 'game.js')
  : join(gameDir, 'game.js');
if (!existsSync(entryPath)) {
  console.error('找不到入口：先构建出 dist/game.js');
  process.exit(1);
}

const code = readFileSync(entryPath);
if (/^\s*import\s/m.test(code.toString('utf8'))) {
  console.error('game.js 里还有 import；必须打成单文件 ESM');
  process.exit(1);
}

const files = {
  'game.json': strToU8(JSON.stringify(manifest, null, 2)),
  'game.js': new Uint8Array(code),
};

for (const root of ['icon.png', 'banner.png']) {
  const path = join(gameDir, root);
  if (existsSync(path)) files[root] = new Uint8Array(readFileSync(path));
}

const assetsDir = join(gameDir, 'assets');
if (existsSync(assetsDir)) {
  for (const path of listFiles(assetsDir)) {
    const rel = relative(assetsDir, path);
    if (rel.split(sep).some((part) => part.startsWith('.'))) continue;
    const ext = extname(path).slice(1).toLowerCase();
    if (!MEDIA.has(ext)) {
      console.error(`素材类型不允许：${rel}`);
      process.exit(1);
    }
    files[`assets/${rel.split(sep).join('/')}`] = new Uint8Array(readFileSync(path));
  }
}

const count = Object.keys(files).length;
const total = Object.values(files).reduce((sum, data) => sum + data.byteLength, 0);
if (count > MAX_FILES) {
  console.error(`文件数超过 ${MAX_FILES}`);
  process.exit(1);
}
if (total > MAX_BYTES) {
  console.error('解压后超过 200MB');
  process.exit(1);
}

const output = resolve(process.argv[3] ?? `${manifest.id}-${manifest.version}.hbx`);
const zip = zipSync(files, { level: 6 });
writeFileSync(output, zip);
console.log(`已生成 ${output}`);
console.log(`  ${manifest.name} ${manifest.version}`);
console.log(
  `  ${count} 个文件，解压后 ${(total / 1024 / 1024).toFixed(1)}MB，包 ${(zip.byteLength / 1024).toFixed(0)}KB`,
);

function listFiles(dir) {
  const result = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      result.push(...listFiles(path));
    } else if (entry.isFile()) {
      result.push(path);
    } else {
      console.error(`不支持的文件类型（符号链接？）：${path}`);
      process.exit(1);
    }
  }
  return result;
}
