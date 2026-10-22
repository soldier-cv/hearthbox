#!/usr/bin/env node
/**
 * 开发服务器启动器：构建夹具 → 同步到壳 → 起 Vite。
 *
 * Playwright 的 webServer 与 `pnpm dev` 共用这一个入口，避免两条命令
 * 在某一步失败时表现不一致（Windows 上 `&&` 串联尤其容易吞错误）。
 */
import { spawn } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

function run(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: root,
      stdio: 'inherit',
      shell: process.platform === 'win32',
      ...options,
    });
    child.on('error', reject);
    child.on('exit', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${command} ${args.join(' ')} exited with ${code}`));
    });
  });
}

try {
  await run('pnpm', ['--filter', '@hearthbox/fixture-contract', 'build']);
  await run('node', ['scripts/link-fixtures.mjs']);
} catch (error) {
  console.error('[dev-server] 夹具构建失败，Vite 不会启动');
  console.error(error);
  process.exit(1);
}

const vite = spawn(
  'pnpm',
  ['--filter', '@hearthbox/shell', 'dev', '--port', '5199', '--strictPort'],
  {
    cwd: root,
    stdio: 'inherit',
    shell: process.platform === 'win32',
  },
);

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => {
    vite.kill(signal);
    process.exit(0);
  });
}

vite.on('exit', (code) => process.exit(code ?? 0));
