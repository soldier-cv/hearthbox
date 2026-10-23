#!/usr/bin/env node
/**
 * 把演示游戏构建好，放进壳的静态目录。
 *
 * 演示游戏在 `demo/`，它的产物会复制到 `apps/shell/public/demo/`，
 * 这样开发服务器能当普通静态文件取到它。
 *
 * 为什么不用软链接：Windows 上要管理员权限，跨平台行为不一致。
 * 复制一个 10KB 的文件比那简单。
 */
import { cp, mkdir, rm, writeFile } from 'node:fs/promises';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const source = join(root, 'demo');
const target = join(root, 'apps/shell/public/demo');
const manifestPath = join(source, 'game.json');

const gameJs = join(source, 'dist/game.js');
if (!existsSync(gameJs)) {
  console.error(`[demo] 缺少 ${gameJs}，先跑 pnpm --filter @hearthbox/demo build`);
  process.exit(1);
}

await rm(target, { recursive: true, force: true });
await mkdir(join(target, 'assets'), { recursive: true });
await cp(gameJs, join(target, 'game.js'));
await cp(manifestPath, join(target, 'game.json'));

if (existsSync(join(source, 'assets'))) {
  await cp(join(source, 'assets'), join(target, 'assets'), { recursive: true });
}

// 静态包（PWA / Tauri / Capacitor）没有 dev server 可以动态生成货架，
// 必须带一份 shelf.json，否则装好的壳打开是空货架。
const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
const shelf = {
  games: [
    {
      id: manifest.id,
      name: manifest.name,
      summary: manifest.summary,
      inputs: Array.isArray(manifest.input) ? manifest.input : ['pad'],
      base: '/demo',
    },
  ],
};
await writeFile(join(root, 'apps/shell/public/shelf.json'), `${JSON.stringify(shelf, null, 2)}\n`);

console.log('[demo] 已把演示游戏放进 apps/shell/public/demo');
