# 在本机跑自己的游戏

游戏放在**工作区根目录下**，与 `hearthbox/` 平级。平台不复制、不吞并你的游戏目录，`pnpm dev` 会自己扫出来。

```
hearthbox-projects/
  hearthbox/        平台
  my-game/          你的游戏
  another-game/     你的游戏
```

M2 之后有 `hbx create` 和 `hbx dev`，那时不必放在同一父目录下。现在是 M1，只有这条路。

## 1. 最小步骤

```bash
cd hearthbox
pnpm install
pnpm dev
```

浏览器打开 `http://127.0.0.1:5199/index.html`。

`pnpm dev` 会做三件事：构建平台演示游戏、把演示游戏同步到壳、扫描工作区根下的游戏并挂到货架。

## 2. 新建一个游戏

在**根目录**（不是 `hearthbox/` 里）建：

```
my-game/
├── game.json
├── package.json
├── tsconfig.json
├── vite.config.ts
├── AGENTS.md        这个游戏的说明，复制后改成实际情况
├── src/main.ts
└── assets/            # 可选
```

### game.json

```json
{
  "id": "me.my-game",
  "name": "我的游戏",
  "summary": "一句话介绍，货架上显示",
  "version": "0.1.0",
  "sdk": "^0.1.0",
  "entry": "game.js",
  "display": { "width": 320, "height": 180, "pixelArt": true, "scale": "integer" },
  "players": { "min": 1, "max": 1 },
  "input": ["pad", "keyboard", "pointer"],
  "pointer": "visible",
  "license": "MIT"
}
```

| 字段 | 容易错的地方 |
|---|---|
| `id` | 必须与 `defineGame({ id })` 一致，格式 `小写.小写` |
| `summary` | 缺了货架会显示 id，很难认 |
| `input` | 只影响货架标识，不影响运行时 |
| `pointer` | 纯手柄游戏写 `"hidden"`，否则鼠标一直显示 |
| `display.width/height` | 逻辑分辨率。320×180 在 1080p 正好 6 倍整数放大 |

### package.json

M1 期间 SDK 还没发布到 npm，用相对路径指进平台仓库：

```json
{
  "name": "my-game",
  "private": true,
  "type": "module",
  "scripts": { "build": "vite build" },
  "dependencies": { "@hearthbox/sdk": "file:../hearthbox/packages/sdk" },
  "devDependencies": { "vite": "^6.0.7" }
}
```

M2 之后把 `file:` 换成版本号。

装依赖时**不要**加进平台 workspace：

```bash
cd ../my-game
pnpm install --ignore-workspace
```

### vite.config.ts

```ts
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
    // 不要写 external: ['@hearthbox/sdk']
    rollupOptions: { output: { inlineDynamicImports: true } },
    minify: false,
  },
});
```

**SDK 必须内联**。包在 blob URL 下执行，裸说明符解析不了，import maps 又要 Chromium 89+。

### tsconfig.json

不要 `extends` 平台仓库里的配置——游戏不在平台仓库内，相对路径会断。直接写：

```json
{
  "compilerOptions": {
    "target": "ES2020",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "lib": ["ES2020", "DOM", "DOM.Iterable"],
    "strict": true,
    "isolatedModules": true,
    "skipLibCheck": true,
    "noEmit": true
  },
  "include": ["src"]
}
```

### src/main.ts

```ts
import { defineGame, type GameContext, type GameInstance } from '@hearthbox/sdk';

export default defineGame({
  id: 'me.my-game',
  async create(ctx: GameContext): Promise<GameInstance> {
    return {
      update(dt: number) {
        ctx.ctx2d.fillStyle = '#0b0b0f';
        ctx.ctx2d.fillRect(0, 0, ctx.width, ctx.height);
      },
      render() {},
    };
  },
});
```

## 3. 让它出现在货架

```bash
cd ../my-game
npx vite build        # 产出 dist/game.js
```

然后回平台目录：

```bash
cd ../hearthbox
pnpm dev
```

货架会自动扫到它。改游戏源码后重新 `npx vite build`，刷新页面即可——不需要重启 dev server。

## 4. 素材

放 `my-game/assets/`，游戏里用相对路径：

```ts
const tile = await ctx.assets.image('tile.png');   // → assets/tile.png
const level = await ctx.assets.json('level1.json');
const music = await ctx.assets.audio('theme.ogg');
```

- 在 `create` 里预加载，不要在 `render` 里加载。
- 路径相对 `assets/`，不要写 `assets/tile.png`。
- 允许：png、jpg、webp、gif、json、txt、ogg、mp3、wav。

## 5. 存档

**平台默认支持，用不用都行。**

```ts
const saved = ctx.storage.get<State>('state');
ctx.storage.set('state', state);
```

- 按 `game.json` 的 `id` 隔离，不同游戏互不可见。
- 同步写内存，约每秒合并落盘一次；`pause`、退出、页面卸载时立刻落盘。
- 关键进度立刻 `set`，不要攒到关卡结束——Android 可能直接杀进程。
- 清空：DevTools → Application → IndexedDB → `hearthbox` → `saves`。

## 6. 调试

```
http://127.0.0.1:5199/play.html?...&debug=1&seed=42&speed=0.5
```

- `debug=1`：`ctx.debug.enabled` 为 true
- `seed=42`：`ctx.debug.seed` 拿到 42
- `speed=0.5`：`update` 的 dt 减半

`ctx.debug.stepFrames(n)` 暂停主循环手动推帧。

## 7. 手柄

`http://127.0.0.1:5199/pads.html` 显示所有手柄的 `id`、`mapping`、轴与按键实时值。这份数据请记到 `docs/m0-findings.md`。

Gamepad API 需要一次用户交互后才暴露设备，先按一下手柄。

## 8. 现在还不能做的事

| 不能 | 为什么 | 什么时候能 |
|---|---|---|
| 打包成 `.hbx` | `hbx pack` 属于 M2 | M2 |
| 从货架安装/更新游戏 | 没有 installer | M2 |
| 在电视上跑 | 需要 Capacitor 壳（M4） | M4 |
| 通过 npm 装 SDK | 还没发布 | M2 之后 |
| 在任意目录开发 | 必须放在工作区根下 | M2 之后有 `hbx dev` |

## 9. 常见问题

**货架上没有我的游戏**
检查三件事：`game.json` 在不在、`dist/game.js` 有没有 build 出来、目录是不是在工作区根下（与 `hearthbox/` 平级）。看 `pnpm dev` 启动时的输出会列出识别到的游戏。

**黑屏、没有崩溃页**
打开 DevTools 控制台。常见原因：`create` 里 await 了不 resolve 的 Promise；`render` 里没画东西；资源路径写了 `assets/xxx`。

**`Failed to resolve module specifier`**
产物里有裸导入。`vite.config.ts` 不能写 `external: ['@hearthbox/sdk']`。

**`ERR_MODULE_NOT_FOUND: @hearthbox/sdk`**
`package.json` 里要用 `file:../hearthbox/packages/sdk`，并先 `pnpm --filter @hearthbox/sdk build`。

**改了代码没变化**
游戏是构建产物。重跑 `npx vite build`，然后刷新页面。
