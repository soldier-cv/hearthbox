# 在本机跑自己的游戏

平台目前处于 M1：**没有安装器，没有 `.hbx` 打包**。所以"把游戏跑到本机"现在只有一条路——把游戏放进平台仓库的 `fixtures/` 下，用开发服务器加载。

这不是最终形态（M2 之后会有 `hbx dev`，不用克隆平台仓库），但现在这条路是完整可用的。

## 1. 最小步骤

```bash
cd hearthbox
pnpm install
pnpm dev          # 自动构建夹具、同步、起服务器
```

浏览器打开 `http://127.0.0.1:5199/index.html`，货架上会列出所有夹具。点进去按 Enter 或手柄键开始。

## 2. 加自己的游戏

在 `fixtures/` 下新建一个目录，结构照 `fixtures/inputs/`：

```
fixtures/my-game/
├── game.json
├── package.json
├── tsconfig.json
├── vite.config.ts
├── src/main.ts
└── assets/            # 可选；没有就不建
```

四个配置文件可以直接复制 `fixtures/inputs/` 里的，只改 `game.json` 的 `id`/`name` 和 `package.json` 的 `name`。

然后：

```bash
pnpm install         # 让 pnpm 认识新包
pnpm fixtures        # 构建并同步
pnpm dev
```

**不需要改平台源码。** 货架清单由 `scripts/link-fixtures.mjs` 从每个 `game.json` 自动生成到 `apps/shell/public/fixtures/index.json`。这是这一轮修掉的主要障碍——之前清单写死在 `apps/shell/src/fixtures.ts` 里，加游戏得改平台代码。

## 3. `game.json` 要写对

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
| `id` | 必须与 `defineGame({ id })` 完全一致，格式 `小写.小写` |
| `summary` | 缺了货架会显示 id，很难认 |
| `input` | 只影响货架标识，不影响运行时；纯手柄游戏写 `["pad"]` |
| `pointer` | 纯手柄游戏写 `"hidden"`，否则鼠标一直在屏幕上 |
| `display.width/height` | 逻辑分辨率。320×180 在 1080p 上正好 6 倍整数放大 |

## 4. 素材

放 `fixtures/my-game/assets/`，游戏里用相对路径：

```ts
const tile = await ctx.assets.image('tile.png');   // → assets/tile.png
const data = await ctx.assets.json('level1.json');
const music = await ctx.assets.audio('theme.ogg');
```

要点：

- **在 `create` 里预加载**，不要在 `render` 里加载。
- 路径相对 `assets/`，不要写 `assets/tile.png`。
- 允许的格式：png、jpg、webp、gif、json、txt、ogg、mp3、wav。
- 同步脚本会把 `assets/` 整个目录复制过去。

## 5. 存档

```ts
const saved = ctx.storage.get<State>('state');
ctx.storage.set('state', state);
```

按游戏 id 隔离。清空某个游戏的存档：DevTools → Application → IndexedDB → `hearthbox` → `saves`，删掉键里含该 id 的条目。或者：

```js
indexedDB.deleteDatabase('hearthbox')
```

## 6. 调试

```
http://127.0.0.1:5199/play.html?...&debug=1&seed=42&speed=0.5
```

- `debug=1`：`ctx.debug.enabled` 为 true
- `seed=42`：`ctx.debug.seed` 拿到 42
- `speed=0.5`：`update` 的 dt 减半，慢放观察

`ctx.debug.stepFrames(n)` 可以暂停主循环手动推帧，复现"第 N 帧才出现"的 bug。

## 7. 手柄

`http://127.0.0.1:5199/pads.html` 显示所有手柄的 `id`、`mapping`、轴、按键实时值。这支手柄的数据请记录到 `docs/m0-findings.md`——那是 M0 的实测项。

Gamepad API 需要一次用户交互后才暴露设备，先按一下手柄。

## 8. 现在还不能做的事

| 不能 | 为什么 | 什么时候能 |
|---|---|---|
| 打包成 `.hbx` | `hbx pack` 属于 M2 | M2 |
| 从货架安装/更新游戏 | 没有 installer | M2 |
| 在电视上跑 | 需要 Capacitor 壳（M4）与 Android SDK | M4 |
| 通过 npm 装 SDK | `@hearthbox/sdk` 还没发布 | M2 之后 |
| 在别的目录开发 | 必须把游戏放进 `fixtures/` | M2 之后有 `hbx dev` |

## 9. 常见问题

**货架上没有我的游戏**
跑过 `pnpm fixtures` 吗？检查 `apps/shell/public/fixtures/index.json` 里有没有它。没有的话看 `pnpm fixtures` 有没有报错。

**黑屏、没有崩溃页**
打开 DevTools 控制台。常见原因：`create` 里 await 了不 resolve 的 Promise；`render` 里没画东西；资源路径写了 `assets/xxx` 而不是 `xxx`。

**`Failed to resolve module specifier`**
产物里有裸导入。`vite.config.ts` 不能写 `external: ['@hearthbox/sdk']`，SDK 必须内联——包在 blob URL 下执行，裸说明符解析不了。

**中文变成方块/乱码**
画布字体。用 `ctx.ctx2d.font = '12px sans-serif'` 并在逻辑分辨率下画，或者干脆用图片。

**改了代码没变化**
Vite 会热更新壳，但**游戏包是构建产物**，改游戏源码要重跑 `pnpm fixtures`。
