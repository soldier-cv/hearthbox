#!/usr/bin/env node
/**
 * 把 fixtures/contract 的构建产物同步到壳的 public/fixtures/contract。
 *
 * 为什么不在 Vite 里做别名：宿主页通过 fetch('../game.js') 取单文件 ESM，
 * 和 M2 从 IndexedDB 取包文件的路径完全同构。用真实静态文件能保证
 * "dev 能跑" 与 "打包后能跑" 走的是同一条代码路径。
 */
import { cp, mkdir, rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const source = join(root, 'fixtures/contract');
const target = join(root, 'apps/shell/public/fixtures/contract');

const gameJs = join(source, 'dist/game.js');
if (!existsSync(gameJs)) {
  console.error(
    `[link-fixtures] 缺少 ${gameJs}，先运行 pnpm --filter @hearthbox/fixture-contract build`,
  );
  process.exit(1);
}

await rm(target, { recursive: true, force: true });
await mkdir(join(target, 'assets'), { recursive: true });
await cp(join(source, 'dist/game.js'), join(target, 'game.js'));
await cp(join(source, 'game.json'), join(target, 'game.json'));

// 素材目录即使为空也保留，宿主按 <dir>/assets/<path> 拼 URL。
if (existsSync(join(source, 'assets'))) {
  await cp(join(source, 'assets'), join(target, 'assets'), { recursive: true });
}

console.log('[link-fixtures] 已同步夹具到 apps/shell/public/fixtures/contract');
