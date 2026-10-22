# 运行时接口

本文档是 `packages/runtime` 的接口契约。实现时按这里写，不要自行发挥。类型以本文档为准；`docs/architecture.md` 只描述职责，不重复签名。

所有接口都是同步的，除非签名标明返回 `Promise`。热路径（每帧调用的方法）禁止分配内存，见 AGENTS.md。

## 1. 模块划分

```
packages/runtime/src/
  loop.ts         主循环
  input.ts        输入汇总、死区、边沿、保留键
  display.ts      画布与缩放
  audio.ts        AudioContext 与总线
  storage.ts      IndexedDB 封装
  host.ts         把以上组装成一次游戏会话
  bridge.ts       HostBridge 类型
```

`catalog` 与 `installer` 属于 M2，接口届时另写，不在这里预留空实现。

## 2. HostBridge

平台本体与壳之间唯一的接口。Web 壳与 Android 壳各有一个实现。

```ts
interface HostBridge {
  readonly kind: 'web' | 'android-tv' | 'tauri';
  inputSources(): InputSource[];
  keepAwake(on: boolean): void;
  onLifecycle(cb: (event: 'pause' | 'resume') => void): () => void;
  exitApp?(): void;
  rumble?(player: number, strong: number, weak: number, ms: number): void;
}
```

- `keepAwake` 在游戏启动时调用 `true`，退出时调用 `false`。Web 实现用 Screen Wake Lock API，拿不到锁时静默失败。
- `onLifecycle` 返回取消订阅函数。Web 实现把 `visibilitychange` 映射过来：`hidden` → `pause`，`visible` → `resume`。
- `rumble` 缺失或底层不支持时，调用方不做任何处理，不报错。

## 3. 输入

`InputSource` 与 `PadState` 的定义见 `docs/input.md`，这里只补汇总层。

```ts
interface InputOptions {
  deadzone: number;        // 径向死区，默认 0.15
  outerDeadzone: number;   // 外圈饱和，默认 0.95
  triggerDeadzone: number; // 默认 0.05
  swapSouthEast: boolean;  // 任天堂布局，默认 false
}

interface Input {
  /** 每帧调用一次，把各源的事件写入内部预分配的 PadState。 */
  sample(): void;
  /** 返回长度恒为 4 的数组，元素对象跨帧复用，调用方不得保存引用。 */
  players(): readonly PadState[];
  /** 本帧是否触发了保留组合键（Guide，或 start+select 持续满 1 秒）。 */
  systemMenuRequested(): boolean;
}
```

- 死区处理：先减去死区再除以 `1 - deadzone`，使输出从 0 开始连续；超过 `outerDeadzone` 的饱和到 1。
- `move` 由 D-pad 与左摇杆合成，D-pad 视为长度 1 的向量，两者取长度较大者。
- 边沿判定在 `sample()` 内完成：本帧 `held` 为真且上一帧为假即 `pressed`。
- 按键排队保证一帧内"按下又松开"仍产生一次 `pressed`，具体队列实现由 `InputSource` 负责。

## 4. 主循环

```ts
interface LoopHandlers {
  update(dt: number): void;     // dt 恒为 1/60
  render(alpha: number): void;  // alpha ∈ [0, 1)
}

interface Loop {
  start(): void;
  stop(): void;
  /** 为 true 时跳过 update，仍调用 render。 */
  paused: boolean;
}
```

- 用 `requestAnimationFrame` 驱动，累加器累加真实经过时间，单帧上限 250ms，防止切回前台时补一长串更新。
- 每个渲染帧最多执行 5 次 `update`，超出的时间直接丢弃。
- `alpha = 累加器余量 / (1/60)`。
- `update` 抛错时循环停止，并把错误交给宿主的错误边界，不吞掉。

## 5. 显示

```ts
interface DisplayOptions {
  width: number;
  height: number;
  scale: 'integer' | 'fit';
  pixelArt: boolean;
}

interface Display {
  readonly canvas: HTMLCanvasElement;
  /** 监听窗口尺寸变化并调整画布。返回取消函数。 */
  attach(container: HTMLElement): () => void;
}
```

- `canvas.width` / `canvas.height` 设为逻辑分辨率乘以整数倍后再考虑 DPR，但传给游戏的坐标系永远是逻辑分辨率。`attach` 时取得唯一的 `CanvasRenderingContext2D` 并 `scale`，游戏不感知，也不再自己取上下文（decisions.md D15）。
- `integer`：取不超过容器的最大整数倍，居中，余量留黑。
- `fit`：等比缩放取较小的一边铺满。
- `pixelArt` 为真时 `imageSmoothingEnabled = false`。
- 容器背景为黑色。

## 6. 音频

```ts
interface Audio {
  readonly ctx: AudioContext;
  readonly music: GainNode;
  readonly sfx: GainNode;
  /** 尝试恢复被挂起的上下文。浏览器可能拒绝，返回是否处于 running。 */
  resume(): Promise<boolean>;
  suspend(): Promise<void>;
  /** 设置总线增益，0 到 1，会持久化到 settings。 */
  setVolume(bus: 'music' | 'sfx', value: number): void;
}
```

- 只有一个 `AudioContext`，`latencyHint: 'interactive'`。
- `music` 与 `sfx` 接到 `ctx.destination`。
- 宿主在收到第一次键盘或手柄输入时调用 `resume()`。若返回 `false`，界面保持"按任意键开始"，不进入游戏。

## 7. 存储

```ts
interface Storage {
  get<T>(store: StoreName, key: IDBValidKey): Promise<T | undefined>;
  put(store: StoreName, key: IDBValidKey, value: unknown): Promise<void>;
  delete(store: StoreName, key: IDBValidKey): Promise<void>;
  /** 在一个事务里执行多步，任何异常都回滚。 */
  transaction<T>(stores: StoreName[], mode: IDBTransactionMode, fn: (tx: IDBTransaction) => Promise<T>): Promise<T>;
}

type StoreName = 'files' | 'installs' | 'saves' | 'settings' | 'profiles' | 'catalog-cache';
```

- 数据库名 `hearthbox`，版本 1。对象库定义与 `docs/package-format.md` 第 6 节一致。
- 版本升级只通过新增版本号和 `onupgradeneeded` 里的迁移完成，禁止删除重建。
- 存档的节流与立即 flush 由宿主实现：内存副本同步读写，每秒最多落盘一次，`pause` 与退出时立刻落盘。

## 8. 宿主

`host.ts` 把上面的模块组装成一次游戏会话，是 `play.html` 唯一调用的入口。

```ts
interface Session {
  /** 加载游戏、创建上下文、启动循环。失败时 reject，由页面显示崩溃页。 */
  start(game: { id: string; manifest: GameManifest; entry: GameModule }): Promise<void>;
  /** 停止循环、flush 存档、释放显示与音频。幂等。 */
  stop(): Promise<void>;
}
```

会话的生命周期：

1. `display.attach`，`audio.resume`，`bridge.keepAwake(true)`。
2. 从 `saves` 读出该游戏的全部键值到内存副本。
3. 构造 `GameContext`（定义见 game-sdk.md），调用 `game.create(ctx)`。
4. 订阅 `bridge.onLifecycle`：`pause` 时置 `loop.paused = true` 并 flush 存档，`resume` 时恢复。
5. `loop.start()`。每帧先 `input.sample()`，若 `systemMenuRequested()` 则打开系统菜单并暂停游戏。
6. `stop()` 时按相反顺序释放，最后 `keepAwake(false)`。

`create`、`update`、`render` 的异常都落到同一处：停止循环、尝试 flush、显示崩溃页并提供"返回货架"。崩溃页的文案包含错误消息，不包含堆栈以外的设备信息。

## 9. 错误处理原则

- 运行时函数不吞异常。能恢复的（拿不到唤醒锁、震动不可用）在各自函数内静默；不能恢复的（存储写失败、游戏抛错）向上抛。
- 存储写失败时游戏会话视为不可继续，走崩溃页，避免在存档损坏的情况下继续运行。
- 所有对外暴露的方法都是幂等的：重复 `start`、重复 `stop` 不报错。
