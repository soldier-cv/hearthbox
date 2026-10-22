import { defineConfig } from 'vite';
import { resolve } from 'node:path';

/**
 * 游戏构建配置。
 *
 * 三个硬约束，缺一不可：
 * - 单文件 ESM：blob URL 下解析不了相对 import
 * - 零裸导入：SDK 必须内联，import maps 要 Chromium 89+，基线是 87
 * - target chrome87：平台兼容基线，见 companion.md
 */
export default defineConfig({
  build: {
    target: 'chrome87',
    lib: {
      entry: resolve(__dirname, 'src/main.ts'),
      formats: ['es'],
      fileName: () => 'game.js',
    },
    rollupOptions: {
      output: { inlineDynamicImports: true },
    },
    minify: false,
  },
});
