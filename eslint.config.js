// @ts-check
import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import compat from 'eslint-plugin-compat';

/**
 * 扁平配置。
 *
 * 除了正确性，这里还锁定几条代码风格要求（见 AGENTS.md「代码规范」）：
 * 函数不要太长、名字不要太长、不要留没用的导出。规则宁紧不松，
 * 因为松了之后没人会回头收紧。
 */
export default tseslint.config(
  {
    ignores: [
      '**/dist/**',
      '**/node_modules/**',
      'apps/shell/public/**',
      'fixtures/*/dist/**',
      'coverage/**',
      'test-results/**',
      'playwright-report/**',
      'native/android/**',
      'native/windows/src-tauri/target/**',
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
        confirm: 'readonly',
        indexedDB: 'readonly',
        performance: 'readonly',
        requestAnimationFrame: 'readonly',
        cancelAnimationFrame: 'readonly',
        setTimeout: 'readonly',
        clearTimeout: 'readonly',
        ResizeObserver: 'readonly',
        AudioContext: 'readonly',
        GainNode: 'readonly',
        Image: 'readonly',
        Blob: 'readonly',
        URL: 'readonly',
        fetch: 'readonly',
        Event: 'readonly',
        EventTarget: 'readonly',
        KeyboardEvent: 'readonly',
        PointerEvent: 'readonly',
        WheelEvent: 'readonly',
        HTMLCanvasElement: 'readonly',
        CanvasRenderingContext2D: 'readonly',
        HTMLElement: 'readonly',
        AudioBuffer: 'readonly',
        AudioContextState: 'readonly',
        BaseAudioContext: 'readonly',
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
        AddEventListenerOptions: 'readonly',
      },
    },
    rules: {
      'compat/compat': 'error',
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/consistent-type-imports': 'error',
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],

      // 规范：一个函数别长到需要靠注释讲清楚"这一段在干什么"。
      // 150 行是上限而非目标：createSession 这类组装函数天然偏长，
      // 硬拆成 return 一堆东西的小片反而更难读（见 AGENTS.md 代码规范 b）。
      'max-lines-per-function': ['error', { max: 150, skipBlankLines: true, skipComments: true }],
      complexity: ['error', 15],
      // 规范：方法名不能太长。20 个字符足够表达，再长就该拆或改名。
      'id-length': ['error', { min: 1, max: 24, exceptions: ['x', 'y', 'id'] }],
      // 一层嵌套足够；三层以上几乎总能提前 return 摊平。
      'no-else-return': 'error',
      eqeqeq: ['error', 'always'],
      'prefer-const': 'error',
      'no-var': 'error',
    },
  },
  {
    // 测试放宽松：用例名要能读，长一点无妨。
    files: ['**/test/**/*.ts', '**/*.config.ts'],
    rules: {
      'compat/compat': 'off',
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/consistent-type-imports': 'off',
      'max-lines-per-function': 'off',
      'id-length': 'off',
    },
  },
  {
    // Node 脚本运行在 Node，不是浏览器。
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
      'max-lines-per-function': 'off',
    },
  },
);
