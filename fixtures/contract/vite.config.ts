import { defineConfig } from 'vite';
import { resolve } from 'node:path';

/**
 * 夹具与正式游戏走同一条约束：单文件输出、target chrome87、零裸导入。
 *
 * SDK 必须内联，不能 external：包入口在 blob URL 下执行，裸说明符
 * （`@hearthbox/sdk`）无法解析，而 import maps 需要 Chromium 89+，
 * 基线是 87。SDK 本身只有类型和一个恒等函数，内联的代价接近零。
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
      // 刻意不写 external：产物里不允许出现任何裸导入。
      output: {
        inlineDynamicImports: true,
      },
    },
    minify: false,
  },
});
