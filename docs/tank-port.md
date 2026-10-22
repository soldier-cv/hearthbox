# 把坦克游戏接进来

> 通用的改造步骤（评估、四步改造、排查表）在 docs/porting.md。这份只讲坦克这一个游戏的具体情况。

> 目标：让 `tank-survivors` 成为平台上第一个**真正能玩**的游戏，而不是演示用的方块。

## 1. 它现在是什么

一个完整的独立网页游戏。实测数据：

| 项 | 现状 |
|---|---|
| 代码量 | 7 个文件，约 150 KB |
| 加载方式 | `index.html` 里 7 个 `<script>` 标签，挂 `window.TS` 全局 |
| 渲染 | 原生 Canvas 2D，只有一个 `getContext('2d')` |
| 主循环 | 自有 `requestAnimationFrame`，**已经是固定步长 + 累积器** |
| 输入 | 自有 `Input` 模块，直接读 `navigator.getGamepads()` 与键盘 |
| 存档 | `localStorage` |
| UI | **55 处 DOM 操作**（17 处 `textContent`、15 处 `classList`、12 处 `querySelector`、6 处 `innerHTML`） |

**好消息**：它的循环思路和平台一致（固定步长、累积器、最多补 5 步）。渲染也是纯 Canvas，不依赖任何绘图库。

**坏消息**：UI 全是 DOM。标题页、模式选择、暂停菜单、结算页都是 `index.html` 里的 `<div>` 和 `<button>`，靠 `classList` 切换显示。

## 2. 为什么不能"直接放进去"

平台的宿主页给游戏一个画布和 `ctx`，游戏只负责 `update` 和 `render`。而坦克游戏：

- **自己接管整页**：它是 `index.html`，平台是 `play.html` 里嵌一个游戏
- **UI 在 DOM 里**：平台要求在画布内画，否则电视上没有鼠标、焦点也没法导航
- **自己读手柄**：平台已经统一了输入，它再读会冲突（尤其 Android 上要走原生桥）

一句话：**它是一个应用，平台要的是一个模块。**

## 3. 移植方案

分四步，每步做完都能跑，不要一口气全改。

### 第 1 步：能加载（半天）

产出：货架上出现"坦克"，点进去能玩，但 UI 还是 DOM。

1. 在工作区根建 `tank-survivors/` 已经是这样了，加 `game.json`：

```json
{
  "id": "hearthbox.tank-survivors",
  "name": "坦克幸存者",
  "summary": "俯视角射击，活到时间结束。",
  "version": "1.0.0",
  "sdk": "^0.1.0",
  "entry": "game.js",
  "display": { "width": 960, "height": 540, "pixelArt": false, "scale": "fit" },
  "players": { "min": 1, "max": 2 },
  "input": ["pad", "keyboard"],
  "pointer": "hidden",
  "license": "MIT"
}
```

2. 加 `vite.config.ts`，把 7 个脚本合成一个 `game.js`：

```ts
export default defineConfig({
  build: {
    target: 'chrome87',
    lib: { entry: 'src/main.js', formats: ['es'], fileName: () => 'game.js' },
    rollupOptions: { output: { inlineDynamicImports: true } },
  },
});
```

但这里有个障碍：现在是 IIFE + `window.TS`，不是模块。要么改成模块，要么在最外层包一个 `export default`。

**最小改法**：新建 `src/index.ts` 作为入口，按顺序 `import` 那 7 个文件（它们挂在 `window.TS` 上），然后 `export default` 一个适配器。

3. 写适配器，把平台循环接到它的 `frame()`：

```ts
export default defineGame({
  id: 'hearthbox.tank-survivors',
  create(ctx) {
    TS.Renderer.init(ctx.canvas);   // 用平台的画布，不用它的
    TS.Input.init(() => {});
    return {
      update(dt) { TS.App.update(dt); },
      render() { TS.Renderer.renderFrame(TS.App.game, dt); },
    };
  },
});
```

**这一步就能玩**，代价是标题页、暂停菜单还是 DOM，且平台的金手指面板弹不出来（被游戏的 DOM 盖住）。

### 第 2 步：输入换成平台的（半天）

删掉它的 `Input.poll()` 与 `getGamepads()`，改成读 `ctx.input`：

| 它现在 | 换成 |
|---|---|
| `Input.pad()` | `ctx.input.p1` |
| `Input.keys` | `ctx.input.keyboard.held()` |
| `Input.poll()` | 删掉，平台每帧已经 `sample()` |

**为什么要做**：不做的话，Android 上会用不了原生手柄桥（D4），且两套输入会打架。

### 第 3 步：UI 搬进画布（一天，最重）

这是工作量最大的一步。55 处 DOM 操作要换成画布绘制。

优先顺序（先做玩家最常看到的）：

1. **HUD**（血条、分数、时间）—— 一直在屏幕上
2. **暂停菜单** —— 游戏中会频繁用
3. **结算页** —— 一局结束必看
4. **标题页 + 模式选择** —— 只在开头看一次

理论上第 4 项可以最后做，甚至这一版直接跳过（用平台的默认开始页）。

**可复用的东西**：它的 `render.js` 已经有完整的 Canvas 绘制能力，画几个按钮和文字不难。缺的是**焦点状态**（哪个按钮被选中）和**手柄导航**（方向键移动焦点）。

### 第 4 步：存档换平台（两小时）

`localStorage` 两处换成 `ctx.storage`。改动很小，但很关键——不然电视上换设备、或者清缓存就丢档。

## 4. 工作量与风险

| 步骤 | 估计 | 风险 |
|---|---|---|
| 1. 能加载 | 半天 | 打包成模块可能遇到 `window.TS` 初始化顺序问题 |
| 2. 输入 | 半天 | 它的输入有组合逻辑（摇杆死区、连发），要对照迁移 |
| 3. UI 搬画布 | 一天 | 最容易做一半、半成品比不做更难看 |
| 4. 存档 | 两小时 | 低 |

**总计约两到三天。**

最大风险是第 3 步：UI 从 DOM 搬到画布，等于重写所有界面。如果只想要"能玩"，可以停在**第 2 步**——DOM UI 在 PC 上完全能用，只是电视上体验差。

**我的建议**：先做 1、2、4 步（一天半），先让它能玩。第 3 步等真的要在电视上玩时再做。

## 5. 要不要先做一个"容器"而不是改造它

还有个更省事的做法：**平台开一个 iframe 直接加载它原来的 `index.html`**。

| | 改造 | iframe |
|---|---|---|
| 工作量 | 2-3 天 | 半天 |
| 能玩 | 能 | 能 |
| 存档隔离 | 平台管 | 它自己的 localStorage |
| 金手指 | 能 | 不能 |
| 电视上手柄 | 要看改造 | 浏览器 Gamepad（Android 上不可靠） |
| 契约一致性 | 完全符合 | 破坏 D5/D12 |

**不推荐 iframe**，因为它绕过了整个平台契约：存档不受管、金手指用不了、Android 手柄失效。但如果你只是想"先看看能不能跑"，可以先用它验证一天，再决定要不要正式移植。

## 6. 移植完能白拿什么

改造之后，坦克自动获得：

- 手柄焦点导航（平台提供）
- 金手指面板（声明几条就能用）
- 设置项（音量、难度、震动）
- 成就（击杀数、存活时间）
- 跨设备存档（换台机器接着玩）
- 统一的暂停与退出

这些不用它自己写。
