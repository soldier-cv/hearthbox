import { defineConfig } from 'vite';
import { resolve } from 'node:path';

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
