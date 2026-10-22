import { defineConfig, devices } from '@playwright/test';

/**
 * 端到端配置。
 *
 * 默认跑得尽量快：不重试、不录 trace。
 * 需要排查时用 `npx playwright test --trace on --retries 2`，或在 CI 里设 CI=1。
 */
export default defineConfig({
  testDir: './apps/shell/test',
  // 多个用例共享同一个 IndexedDB，串行更贴近真机行为。
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env['CI'],
  // 本地不重试：失败就是失败，重试只会让反馈变慢。
  retries: process.env['CI'] ? 1 : 0,
  reporter: process.env['CI'] ? 'list' : 'dot',
  timeout: 30_000,
  use: {
    baseURL: 'http://127.0.0.1:5199',
    // 本地不录 trace，CI 只在重试时录。
    trace: process.env['CI'] ? 'on-first-retry' : 'off',
    // 不需要持久化 storageState 的用例，用干净的上下文。
    screenshot: 'only-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: 'node scripts/dev-server.mjs',
    url: 'http://127.0.0.1:5199/index.html',
    // 本地复用已启动的服务，省掉每次 20 秒的启动时间。
    reuseExistingServer: !process.env['CI'],
    timeout: 120_000,
    stdout: 'pipe',
    stderr: 'pipe',
  },
});
