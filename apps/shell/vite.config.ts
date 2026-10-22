import { defineConfig } from 'vite';
import { resolve } from 'node:path';

/**
 * 壳的 Vite 配置。
 *
 * 游戏代码永远不经过打包器：开发期用 fetch 取文本再造 blob URL import，
 * 生产期从 IndexedDB 取。两边是同一条代码路径，不会出现
 * "dev 能跑、打包后跑不了"。
 *
 * 工作区里的游戏由 scripts/dev-server.mjs 的网关提供，不经过这里——
 * 游戏不在平台仓库内，不该被壳的构建配置感知。
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
    // dev-server.mjs 的网关转发到这里。
    port: 5200,
    strictPort: true,
    fs: {
      // 允许读到工作区根：工作区游戏的 dist 在平台仓库外面。
      allow: [resolve(__dirname, '../..'), resolve(__dirname, '../../..')],
    },
  },
});
