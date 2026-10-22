import { defineConfig } from 'vite';
import { resolve } from 'node:path';

/**
 * 壳的 Vite 配置。
 *
 * 关键点：游戏代码永远不经过打包器。开发期从 /fixtures/ 用 fetch 取文本，
 * 再造 blob URL import；生产期从 IndexedDB 取。两边是同一条代码路径，
 * 也就不会出现"dev 能跑、打包后跑不了"。
 *
 * Vite 的 public 目录会被原样复制，但禁止被 source code import——
 * 这正是我们要的：宿主只用 fetch 取它，不 import。
 */
export default defineConfig({
  build: {
    target: 'chrome87',
    rollupOptions: {
      input: {
        index: resolve(__dirname, 'index.html'),
        play: resolve(__dirname, 'play.html'),
        pads: resolve(__dirname, 'pads.html'),
      },
    },
  },
  publicDir: resolve(__dirname, 'public'),
  server: {
    // 显式绑 127.0.0.1：Playwright 与 curl 探的是 IPv4，
    // 而 Vite 默认只监听 localhost（可能只解析到 ::1）。
    host: '127.0.0.1',
  },
});
