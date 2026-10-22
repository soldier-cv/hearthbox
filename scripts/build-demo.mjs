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
import { cp, mkdir, rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const source = join(root, 'demo');
const target = join(root, 'apps/shell/public/demo');

const gameJs = join(source, 'dist/game.js');
if (!existsSync(gameJs)) {
  console.error(`[demo] 缺少 ${gameJs}，先跑 pnpm --filter @hearthbox/demo build`);
  process.exit(1);
}

await rm(target, { recursive: true, force: true });
await mkdir(join(target, 'assets'), { recursive: true });
await cp(gameJs, join(target, 'game.js'));
await cp(join(source, 'game.json'), join(target, 'game.json'));

if (existsSync(join(source, 'assets'))) {
  await cp(join(source, 'assets'), join(target, 'assets'), { recursive: true });
}

console.log('[demo] 已把演示游戏放进 apps/shell/public/demo');
