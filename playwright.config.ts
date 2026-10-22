import { defineConfig, devices } from '@playwright/test';

/**
 * 端到端配置。
 *
 * webServer 用一个包装脚本：先构建夹具、再起 Vite。
 * 不写成 `a && b`，因为 Playwright 在 Windows 上用 cmd 解析，
 * 串联失败时错误信息会被吞掉，看起来像"服务起不来"。
 */
export default defineConfig({
  testDir: './apps/shell/test',
  // 存档用例共享同一个 IndexedDB，串行更贴近真机行为。
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env['CI'],
  retries: process.env['CI'] ? 2 : 0,
  reporter: 'list',
  timeout: 60_000,
  use: {
    baseURL: 'http://127.0.0.1:5199',
    trace: 'on-first-retry',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: 'node scripts/dev-server.mjs',
    url: 'http://127.0.0.1:5199/index.html',
    reuseExistingServer: !process.env['CI'],
    timeout: 180_000,
    stdout: 'pipe',
    stderr: 'pipe',
  },
});
