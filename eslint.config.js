// @ts-check
import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import compat from 'eslint-plugin-compat';

/**
 * 扁平配置。
 *
 * compat 的 browserslist 目标是 chrome >= 87（见 docs/compatibility.md D9）。
 * 它只能检查 DOM/JS API，检查不了语法 —— 语法由 tsconfig 的 target
 * 与构建时的 esbuild target 保证，两处都必须是 chrome87。
 */
export default tseslint.config(
  {
    ignores: [
      '**/dist/**',
      '**/node_modules/**',
      'apps/shell/public/**',
      'fixtures/contract/dist/**',
      'coverage/**',
      'test-results/**',
      'playwright-report/**',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['**/*.ts', '**/*.tsx'],
    plugins: { compat },
    languageOptions: {
      parserOptions: {
        ecmaVersion: 2020,
        sourceType: 'module',
      },
      globals: {
        window: 'readonly',
        document: 'readonly',
        navigator: 'readonly',
        location: 'readonly',
        indexedDB: 'readonly',
        performance: 'readonly',
        requestAnimationFrame: 'readonly',
        cancelAnimationFrame: 'readonly',
        ResizeObserver: 'readonly',
        AudioContext: 'readonly',
        GainNode: 'readonly',
        Image: 'readonly',
        Blob: 'readonly',
        Event: 'readonly',
        EventTarget: 'readonly',
        KeyboardEvent: 'readonly',
        HTMLCanvasElement: 'readonly',
        CanvasRenderingContext2D: 'readonly',
        HTMLElement: 'readonly',
        AudioBuffer: 'readonly',
        IDBValidKey: 'readonly',
        IDBTransaction: 'readonly',
        IDBTransactionMode: 'readonly',
        IDBObjectStore: 'readonly',
        IDBRequest: 'readonly',
        IDBDatabase: 'readonly',
        IDBFactory: 'readonly',
        Gamepad: 'readonly',
        GamepadButton: 'readonly',
        FrameRequestCallback: 'readonly',
        AudioContextState: 'readonly',
        BaseAudioContext: 'readonly',
      },
    },
    rules: {
      'compat/compat': 'error',
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/consistent-type-imports': 'error',
    },
  },
  {
    // 测试可以用 any，且允许 import() 类型注解
    files: ['**/test/**/*.ts', '**/*.config.ts'],
    rules: {
      'compat/compat': 'off',
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/consistent-type-imports': 'off',
    },
  },
  {
    // Node 脚本：脚本运行在 Node，不是浏览器
    files: ['scripts/**/*.mjs', '*.config.js'],
    languageOptions: {
      globals: {
        process: 'readonly',
        console: 'readonly',
        URL: 'readonly',
        __dirname: 'readonly',
      },
    },
    rules: {
      'compat/compat': 'off',
      'no-undef': 'off',
    },
  },
);
