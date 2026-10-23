/**
 * Vitest 全局配置。
 * 运行时的测试只依赖 Node + fake-indexeddb，不开 jsdom（快，也更接近真实约束）。
 */
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: [
      'packages/*/test/**/*.test.ts',
      'apps/*/test/**/*.test.ts',
      'apps/*/unit/**/*.test.ts',
      'tools/*/test/**/*.test.ts',
    ],
    passWithNoTests: true,
  },
});
