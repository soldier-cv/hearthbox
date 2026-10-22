#!/usr/bin/env node
/**
 * 把 fixtures/* 的构建产物同步到壳的 public/fixtures/。
 *
 * 为什么不在 Vite 里做别名：宿主页通过 fetch 取单文件 ESM 再建 blob URL，
 * 和 M2 从 IndexedDB 取包文件的路径完全同构。用真实静态文件能保证
 * "dev 能跑" 与 "打包后能跑" 走的是同一条代码路径。
 */
import { cp, mkdir, readdir, rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const fixturesDir = join(root, 'fixtures');
const targetRoot = join(root, 'apps/shell/public/fixtures');

const entries = await readdir(fixturesDir, { withFileTypes: true });
const fixtures = entries.filter((entry) => entry.isDirectory()).map((entry) => entry.name);

if (fixtures.length === 0) {
  console.error('[link-fixtures] fixtures/ 下没有任何夹具');
  process.exit(1);
}

await rm(targetRoot, { recursive: true, force: true });

for (const name of fixtures) {
  const source = join(fixturesDir, name);
  const gameJs = join(source, 'dist/game.js');
  if (!existsSync(gameJs)) {
    console.error(`[link-fixtures] 缺少 ${gameJs}，先构建 ${name}`);
    process.exit(1);
  }

  const target = join(targetRoot, name);
  await mkdir(join(target, 'assets'), { recursive: true });
  await cp(gameJs, join(target, 'game.js'));
  await cp(join(source, 'game.json'), join(target, 'game.json'));

  // 素材目录即使为空也保留，宿主按 <dir>/assets/<path> 拼 URL。
  if (existsSync(join(source, 'assets'))) {
    await cp(join(source, 'assets'), join(target, 'assets'), { recursive: true });
  }
}

console.log(`[link-fixtures] 已同步 ${fixtures.join(', ')} 到 apps/shell/public/fixtures/`);
