# 游戏 SDK 契约

游戏只依赖 `@hearthbox/sdk`。SDK 只导出类型和 `defineGame()`，没有运行时依赖。

## 1. 一个游戏就是一个模块

`game.js` 是单文件 ESM，默认导出 `defineGame()` 的返回值：

```ts
import { defineGame, type GameContext, type GameInstance } from '@hearthbox/sdk';

export default defineGame({
  id: 'author.neon-drift',     // 必须与 game.json 的 id 一致
  async create(ctx: GameContext): Promise<GameInstance> {
    const sprites = await ctx.assets.image('sprites.png');
    return {
      update(dt: number) { /* dt 恒为 1/60 秒 */ },
      render(alpha: number) { /* alpha ∈ [0,1)，用于帧间插值 */ },
      pause() {},
      resume() {},
      dispose() {},
    };
  },
});
```

- 游戏**不得**调用 `requestAnimationFrame`、`setTimeout` 驱动逻辑、或读取 `navigator.getGamepads()`。
- 游戏**不得**依赖任何全局对象（`window`、`document` 之外的平台内部对象）。`ctx` 是唯一的平台接口。
- 构建时 SDK **必须内联**进 `game.js`，产物里不允许出现任何裸导入（包括 `@hearthbox/sdk`）。原因：包入口在 blob URL 下执行，裸说明符无法解析，而 import maps 需要 Chromium 89+，基线是 87。SDK 只有类型和一个恒等函数，内联后不增加体积。
- 输入有三层：`p1`（手柄层，键盘方向和 WASD 也在里面）、`keyboard`（完整物理键位）、`pointer`（鼠标/触控，坐标已是逻辑像素）。**只想做上下左右的小游戏只读 `p1` 就够；点击类游戏读 `pointer`。** 三者可同时工作，不需要声明"我只支持鼠标"。
- **随机数用 `ctx.random`，不要用 `Math.random()`。** 平台把 `debug.seed` 传给它，同一 seed 能完全复现整局行为——这是排查"第 N 帧才出现的 bug"的前提。`ctx.random.seed` 随时可读，复现时记下来即可。
- 金手指由游戏声明、平台持有开关：`ctx.cheats.declare({ id, name })` 声明，`ctx.cheats.enabled(id)` 读取。**不要在游戏里自己写开关界面**，由壳的系统菜单统一提供；默认开启的只允许是纯便利项。详见 `docs/cheats.md`。

## 2. 生命周期

```
create(ctx) ──► update(dt) × N ──► render(alpha) × M ──► dispose()
                    ▲  │
              resume() pause()
```

| 方法 | 调用时机 | 要求 |
|---|---|---|
| `create(ctx)` | 安装资源加载完毕、存档已读入内存后，只调用一次 | 可 async；抛错 → 崩溃页 |
| `update(dt)` | 固定 60Hz，`dt` 恒为 `1/60` | 必须纯逻辑，不碰 DOM/Canvas |
| `render(alpha)` | 每个显示帧一次，`alpha` 是距下一个 update 的插值系数 | 只做绘制 |
| `pause()` | 系统菜单打开、窗口失焦、应用进入后台 | 停止音频等 |
| `resume()` | 恢复 | |
| `dispose()` | 退出游戏前 | 释放 WebGL 资源、撤销自己创建的对象 |

- 平台在 `pause` 期间不调用 `update`，但继续调用 `render`（画面冻结）。
- 应用被系统直接杀掉时 `dispose` 不一定被调用，所以存档不能只在 `dispose` 里写。

## 3. GameContext

```ts
interface GameContext {
  readonly ctx2d: CanvasRenderingContext2D; // 平台已取好的 2D 上下文，见 decisions.md D15
  readonly width: number;                   // 逻辑像素宽，等于 game.json 声明值
  readonly height: number;
  readonly input: InputView;            // 见 input.md
  readonly assets: AssetLoader;
  readonly audio: AudioApi;
  readonly storage: StorageApi;
  readonly platform: PlatformInfo;
  exit(): void;                         // 返回货架
  rumble(strong: number, weak: number, ms: number): void;  // 尽力而为
}

interface InputView {
  readonly p1: PadState;               // 快捷方式
  readonly players: readonly PadState[]; // 长度 4，未连接的 connected=false
}

interface PlatformInfo {
  shell: 'android-tv' | 'web' | 'tauri';
  sdkVersion: string;                  // 平台提供的 SDK 版本
  locale: string;
}
```

### 资源

```ts
interface AssetLoader {
  image(path: string): Promise<HTMLImageElement>;   // 已 decode
  audio(path: string): Promise<AudioBuffer>;
  json<T = unknown>(path: string): Promise<T>;
  text(path: string): Promise<string>;
  url(path: string): string;                         // blob URL，仅用于特殊情况
}
```

- `path` 相对包内 `assets/` 目录，例如 `assets.image('sprites.png')` 对应包内 `assets/sprites.png`。
- 平台在 `create` 返回后即可使用；建议在 `create` 里预加载全部资源。
- 所有 blob URL 由平台在退出时统一撤销，游戏不用管。

### 音频

```ts
interface AudioApi {
  readonly ctx: AudioContext;          // 平台唯一的一个，latencyHint: 'interactive'
  music: GainNode;                     // 两条总线，音量由平台设置控制
  sfx: GainNode;
}
```

- 游戏把自己的音频节点接到 `music` 或 `sfx`，不要直接接到 `ctx.destination`。
- 暂停、失焦、退出时平台自动挂起/断开，游戏不用处理。
- 解锁策略见 input.md 第 7 节（M0 验证）。

### 存档

**存档是平台默认能力，游戏可以选择不用。** 不需要注册、不需要申请、不需要在 `game.json` 里声明。只要调 `ctx.storage.set` 就会存，不调就什么都不存。

```ts
interface StorageApi {
  get<T>(key: string): T | undefined;      // 同步，读内存副本
  set(key: string, value: unknown): void;  // 同步写内存，异步落盘
  delete(key: string): void;
}
```

- 每个游戏一个命名空间（按 `game.json` 的 `id` 隔离），游戏之间互不可见。
- 值必须是可结构化克隆的纯数据，单游戏上限 1MB。
- 平台每秒最多落盘一次（合并写），并在 `pause`、退出、页面卸载时立刻落盘。
- **关键进度要在拿到时立刻 `set`**。Android 可能直接杀进程，`dispose` 不保证执行。
- 卸载游戏时存档默认保留，可勾选"同时删除存档"。

不想做存档的游戏什么都不用写，`ctx.storage` 就在那里，不用即可。

## 4. game.json

```json
{
  "id": "author.neon-drift",
  "name": "霓虹漂移",
  "version": "1.2.0",
  "sdk": "^1.0.0",
  "entry": "game.js",
  "display": { "width": 320, "height": 180, "pixelArt": true, "scale": "integer" },
  "players": { "min": 1, "max": 1 },
  "license": "MIT",
  "assetsLicense": "CC-BY-4.0"
}
```

| 字段 | 约束 |
|---|---|
| `id` | `^[a-z0-9-]+(\.[a-z0-9-]+)+$`，全局唯一，发布后不可更改 |
| `version` | semver |
| `sdk` | semver 范围；平台的 SDK 版本不满足时，货架显示"不兼容"，拒绝启动 |
| `display.width/height` | 逻辑分辨率。像素游戏推荐 320×180（1080p 的 6 倍、4K 的 12 倍，整数缩放不糊） |
| `display.scale` | `integer`（默认，像素游戏）或 `fit`（任意缩放，适合矢量风） |
| `license` / `assetsLicense` | SPDX 标识符，开源分发时必填 |

## 5. 版本兼容规则

- SDK 主版本号内只做**加法**修改：可以新增可选字段与方法，不删除、不改语义。
- 需要破坏性修改时升主版本，旧包继续被旧主版本的平台运行；平台可以同时内置多个 SDK 主版本的宿主（v1 不需要，但契约按此演进）。
- `sdk` 范围不匹配的包：保留已安装文件，但不允许启动。

## 6. 性能约束（游戏侧）

- `update` 与 `render` 中**不分配**可避免的对象：复用向量、不要每帧创建数组/闭包。
- 图片在 `create` 里解码完，不要在 `render` 里同步解码。
- 像素游戏用最近邻采样（平台对 `pixelArt: true` 的画布设置 `imageSmoothingEnabled = false`）。
- 单帧预算见 [compatibility.md](compatibility.md)。
