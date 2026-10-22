#!/usr/bin/env node
/**
 * 把 fixtures/* 的构建产物同步到壳的 public/fixtures/，并生成货架清单。
 *
 * 货架清单从每个包的 game.json 生成，不从平台源码里写死：
 * 加一个游戏只需要新建目录，平台不需要改代码。
 */
import { cp, mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises';
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

const shelf = [];

for (const name of fixtures) {
  const source = join(fixturesDir, name);
  const gameJs = join(source, 'dist/game.js');
  if (!existsSync(gameJs)) {
    console.error(`[link-fixtures] 缺少 ${gameJs}，先构建 ${name}`);
    process.exit(1);
  }

  // 必须指定 utf8：不指定时 readFile 返回 Buffer，中文会变成乱码，
  // JSON.parse 随之失败或字段丢失。
  const manifest = JSON.parse(await readFile(join(source, 'game.json'), 'utf8'));

  const target = join(targetRoot, name);
  await mkdir(join(target, 'assets'), { recursive: true });
  await cp(gameJs, join(target, 'game.js'));
  await cp(join(source, 'game.json'), join(target, 'game.json'));

  // 素材目录即使为空也保留，宿主按 <dir>/assets/<path> 拼 URL。
  if (existsSync(join(source, 'assets'))) {
    await cp(join(source, 'assets'), join(target, 'assets'), { recursive: true });
  }

  shelf.push({
    id: manifest.id,
    name: manifest.name,
    // game.json 没有 summary 字段时退回一句占位，而不是让货架空着。
    summary: typeof manifest.summary === 'string' ? manifest.summary : manifest.id,
    inputs: Array.isArray(manifest.input) ? manifest.input : ['pad'],
    entry: 'game.js',
    manifest: 'game.json',
    base: `/fixtures/${name}`,
  });
}

await writeFile(
  join(targetRoot, 'index.json'),
  `${JSON.stringify({ fixtures: shelf }, null, 2)}\n`,
  'utf8',
);

console.log(`[link-fixtures] 已同步 ${fixtures.join(', ')}，货架共 ${shelf.length} 个条目`);
