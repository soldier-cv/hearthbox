# 游戏接入指南

> 给已经有一个能跑的网页游戏、想把它接到炉边上的人。
>
> 从头做游戏看 `templates/game/`。这份文档只讲**改造**。

## 先花十分钟评估，别急着改代码

把这几条对着你的游戏过一遍，用数字判断工作量：

```bash
# 有多少 DOM 操作（HTML 按钮、div 菜单）
grep -c "querySelector\|getElementById\|classList\|textContent\|innerHTML" src/*.js

# 有没有自己的主循环
grep -n "requestAnimationFrame" src/*.js

# 有没有直接读输入
grep -n "getGamepads\|addEventListener('key" src/*.js

# 存档存在哪
grep -n "localStorage\|indexedDB" src/*.js
```

对照结果估工期：

| 情况 | 大致工作量 |
|---|---|
| 只有循环和输入要换，UI 已经在画布内 | 1 天 |
| UI 是 HTML，但不多（就一两个菜单） | 2 天 |
| UI 是 HTML 且不少（标题、暂停、结算、HUD 都有） | 3 天 |
| 代码是几千行的单文件，没有模块结构 | 4 天以上 |

**一个真实的例子**：`tank-survivors` 有 55 处 DOM 操作（17 `textContent`、15 `classList`、12 `querySelector`、6 `innerHTML`），估 2–3 天。详见 `docs/tank-port.md`。

## 为什么不能直接放进去

炉边要的是**一个模块**，不是一个完整网页：

| 你的游戏是 | 平台要的是 |
|---|---|
| 自己接管整页，有 `index.html` | 平台给一个画布，游戏画在里面 |
| 自己跑 `requestAnimationFrame` | 平台统一驱动 60Hz 循环 |
| 自己读手柄 / 监听键盘 | 平台统一成 `ctx.input` |
| 自己写 `localStorage` | 平台统一成 `ctx.storage` |
| HTML 按钮做菜单 | 画在画布内，手柄能选 |

前四条是**替换**，第五条是**重写**。所以 UI 是 HTML 的时候最费时。

## 四步改造，每步都能跑

**不要一口气全改。** 每完成一步就验证一次能玩。

### 第 1 步：能加载（约半天）

三件事：加清单、打包成单文件、写适配器。

**加 `game.json`**（放在游戏目录根）：

```json
{
  "id": "me.my-game",
  "name": "我的游戏",
  "summary": "一句话介绍",
  "version": "0.1.0",
  "sdk": "^0.1.0",
  "entry": "game.js",
  "display": { "width": 960, "height": 540, "pixelArt": false, "scale": "fit" },
  "players": { "min": 1, "max": 1 },
  "input": ["pad", "keyboard"],
  "pointer": "hidden",
  "license": "MIT"
}
```

分辨率按你的游戏定：像素风 320×180 + `pixelArt: true` + `scale: "integer"`；矢量风 960×540 + `scale: "fit"`。

**打包成单个 `game.js`**：

```ts
// vite.config.ts
import { defineConfig } from 'vite';

export default defineConfig({
  build: {
    target: 'chrome87',
    lib: { entry: 'src/main.ts', formats: ['es'], fileName: () => 'game.js' },
    rollupOptions: { output: { inlineDynamicImports: true } },
  },
});
```

如果你现在是多个 `<script>` 标签加全局变量（`window.TS` 这种），再加一个入口文件按顺序 import 它们：

```ts
// src/index.ts
import './util.js';      // 每个文件自己挂到 window.TS 上
import './audio.js';
import './input.js';
// ...
import { attach } from './platform.js';

export default attach();
```

**写适配器**，把平台的循环接到你原有的：

```ts
import { defineGame } from '@hearthbox/sdk';
import { App } from './app';

export default defineGame({
  id: 'me.my-game',
  async create(ctx) {
    App.init(ctx.ctx2d, ctx.width, ctx.height);

    return {
      update(dt) {
        // 平台保证 dt 恒为 1/60。
        // 你原来的累积器可以删掉，也可以留着（它只会永远够一步）。
        App.step(dt);
      },
      render() {
        App.draw();
      },
    };
  },
});
```

**这一步做完就能玩**。UI 还是 HTML、存档还是 localStorage，但游戏跑起来了。

### 第 2 步：输入换成平台的（约半天）

| 你原来的 | 换成 |
|---|---|
| `navigator.getGamepads()` | `ctx.input.p1` |
| `addEventListener('keydown')` | `ctx.input.keyboard.held('KeyA')` |
| 自己的鼠标事件 | `ctx.input.pointer.x / .y / .pressed('left')` |

**为什么必须换**：Android TV 的 WebView 里 Gamepad API 不可靠，平台走原生桥。不换的话电视上没有手柄。

如果你有自己的封装（`Input.left()` 之类），**只改内部实现，不动调用点**。这样改动面最小。

### 第 3 步：存档换平台（约两小时）

```ts
// 原来
localStorage.setItem('save', JSON.stringify(data));

// 现在
ctx.storage.set('save', data);
```

**为什么必须换**：平台的存档按游戏 id 隔离、跨设备、卸载游戏默认保留。`localStorage` 会跟着浏览器清缓存一起没，而且在 Android 壳里换 origin 就全丢。

### 第 4 步：UI 搬进画布（约一天，最重）

**只有这一步是重写。**

优先级按玩家看到的频率：

1. **HUD**（血条、分数、时间）—— 一直在屏幕上
2. **暂停菜单** —— 一局点好几次
3. **结算页** —— 每局必看
4. **标题页** —— 一局看一次，**这一版可以先不做**

画按钮本身不难，难在两件事：焦点状态、手柄导航。

最小够用的实现：

```ts
const items = [
  { label: '继续', run: () => resume() },
  { label: '重开', run: () => restart() },
  { label: '退出', run: () => ctx.exit() },
];
let focus = 0;

// update 里
if (ctx.input.p1.pressed('down')) focus = Math.min(items.length - 1, focus + 1);
if (ctx.input.p1.pressed('up')) focus = Math.max(0, focus - 1);
if (ctx.input.p1.pressed('south')) items[focus].run();

// render 里
g.font = '16px monospace';
items.forEach((item, i) => {
  g.fillStyle = i === focus ? '#f5a524' : '#9a9aa8';
  g.fillText(item.label, 40, 60 + i * 28);
});
```

**如果只想先玩起来**：做完 1、2、3 步就停。HTML UI 在 PC 上完全能用，只是电视上没鼠标点不了。

### 第 5 步（可选）：金手指与设置

不写也能玩。写了之后，平台面板会自动出现。

关键是**数值不要写在逻辑里**，走一层可调表：

```
config.ts   常量（分辨率、颜色）—— 永不变
tuning.ts   可调量（速度、经验、出怪）—— 金手指改这里
main.ts     只读 tuning.xxx(base)
```

```ts
ctx.options.declare({
  id: 'move-speed',
  name: '移动速度',
  kind: 'number',
  min: 1, max: 3, step: 0.25, defaultValue: 1,
  unit: '×',
});

// 用的时候
const speed = SPEED * ctx.options.number('move-speed');
```

完整说明见 `docs/tuning.md`。

## 改完之后白拿什么

- 手柄焦点导航、统一的暂停与退出
- 金手指面板（声明几条就有）
- 设置项、成就展示
- 跨设备存档
- 电视上也能玩

## 排查

| 现象 | 原因 |
|---|---|
| 黑屏没报错 | `create` 里 await 了不 resolve 的东西；或 `render` 没画 |
| `Failed to resolve module specifier` | 产物有裸导入，SDK 没内联 |
| 手柄没反应 | 还在读 `navigator.getGamepads()` |
| 鼠标点不准 | 自己乘了缩放倍数，`pointer.x` 已是逻辑像素 |
| 刷新后存档没了 | 还在用 `localStorage`，或者只写在 `dispose` 里 |
| 画面糊 | `pixelArt: true` 却在画矢量，或逻辑分辨率太高 |
| 改了代码没变化 | 游戏是构建产物，要重新 `npx vite build` |
| 两套输入打架 | 旧的输入监听没删干净，和 `ctx.input` 同时生效 |

## 做完之后

游戏能跑起来，就可以考虑打包分发了。见 `docs/distribution.md`。

现在（M2 之前）还不是正式渠道：游戏放在工作区根目录，`pnpm dev` 会扫到它。M2 有 `hbx pack` 之后才打成 `.hbx` 分发给别人。
