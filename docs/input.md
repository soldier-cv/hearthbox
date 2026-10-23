# 输入管线

输入是这个平台最核心、最容易出 bug 的部分。原则：**所有平台差异都在 InputSource 里消化，游戏看到的永远是同一个 `PadState`。**

## 1. 管线

```
InputSource（每个平台若干）           runtime/input                  游戏
┌────────────────────────┐
│ AndroidNativeSource    │──事件队列──┐
│ WebGamepadSource       │──轮询──────┼─► 映射 → 死区 → 合并 → 边沿 ─► PadState[]（预分配，每次 update 复用）
│ KeyboardSource         │──事件队列──┘        ▲
└────────────────────────┘                    │
                                     profile（设备映射 + 用户重映射）
```

```ts
interface InputSource {
  id: string;
  start(): void;
  stop(): void;
  // 每次固定步更新调用一次：把自上次以来的事件/状态写入 raw，不分配内存
  drain(raw: RawDeviceState[]): void;
}
```

- **按键事件排队，不丢快速按压**：一帧之内"按下又松开"也会产生一次 `pressed`。
- **轴取最新值**：轴的变化只保留最后一个值。
- **设备与玩家分离**：设备按连接顺序分配到 P1–P4，在设置中可重新分配。v1 的游戏只需要 P1，但数据结构一开始就是数组。

## 2. 游戏看到的状态

平台把三类设备汇总成同一个 `InputView`。三类**彼此独立、可同时工作**：玩家可以一边推摇杆一边点鼠标，也可以只用键盘。游戏按需读其中任意一层，不必关心设备细节。

```ts
interface InputView {
  readonly p1: PadState;              // 手柄层：预设映射，适合"只要上下左右"
  readonly players: readonly PadState[];  // 长度 4
  readonly keyboard: KeyboardState;   // 完整物理键位
  readonly pointer: PointerState;     // 鼠标 / 触控 / 触控笔
}
```

### 2.1 手柄层（也承接键盘预设与方向键）

```ts
type Button =
  | 'south' | 'east' | 'west' | 'north'     // 按位置命名：A/B/X/Y 在不同手柄上标签不一样
  | 'l1' | 'r1' | 'l2' | 'r2' | 'l3' | 'r3'
  | 'start' | 'select'
  | 'up' | 'down' | 'left' | 'right';

interface PadState {
  connected: boolean;
  lx: number; ly: number; rx: number; ry: number;  // -1..1，已过径向死区并重新缩放
  lt: number; rt: number;                          // 0..1
  move: { x: number; y: number };                  // D-pad 与左摇杆合并，长度 ≤ 1
  held(b: Button): boolean;
  pressed(b: Button): boolean;    // 本次 update 中刚按下
  released(b: Button): boolean;
}
```

键盘的默认映射（`input.md` 第 6 节）也写进这一层：方向键与 WASD → `up/down/left/right`，J/K/U/I → `south/east/west/north`，Enter → `start`，Shift → `select`，Q/E → `l1/r1`，空格 → `south`。**只想做上下左右的小游戏，只读 `p1` 就够了**，不必知道玩家用的是手柄还是键盘。

- **确认/返回的语义**：确认 = `south`，返回 = `east`（Xbox 布局）。设置中可切换为任天堂布局（交换 south/east），对货架 UI 和遵守此语义的游戏同时生效。
- **死区**：摇杆默认径向死区 0.15，外圈 0.95 饱和；扳机 0.05。可在设置中调整，并按设备保存。

### 2.2 键盘层（完整键位）

```ts
interface KeyboardState {
  connected: boolean;
  held(code: string): boolean;      // code 是 KeyboardEvent.code，如 'KeyA'、'ArrowLeft'
  pressed(code: string): boolean;
  released(code: string): boolean;
  readonly heldCodes: readonly string[];
}
```

- 用 **物理键位**（`code`）而不是字符：同一个键在不同布局下产生不同字符，游戏要的是"那个键"。
- 这一层不受预设映射限制。`held('KeyZ')` 能拿到 `KeyZ`，即使它没映射到任何手柄按钮。
- 文本输入（输入框、中文输入法）不在 v1 范围。需要打字的游戏等 v2。

### 2.3 指针层（鼠标 / 触控）

```ts
interface PointerState {
  connected: boolean;
  inside: boolean;      // 是否在画布内
  x: number;            // 逻辑坐标，原点在画布左上角
  y: number;
  moved: boolean;
  dx: number; dy: number;   // 本帧相对位移
  wheel: number;            // 本帧滚轮位移，向下为正
  held(b: 'left' | 'middle' | 'right'): boolean;
  pressed(b: 'left' | 'middle' | 'right'): boolean;
  released(b: 'left' | 'middle' | 'right'): boolean;
}
```

- 坐标**已经换算成逻辑像素**。游戏不用管画布被放大到了 640×360 还是 1280×720，`pointer.x` 永远在 `0..width` 内。
- 触摸与鼠标走同一条路径（Pointer Events），触摸就是"点一下"。
- 指针外观由 `game.json` 的 `pointer` 声明，运行时可 `ctx.setPointerMode('hidden' | 'visible' | 'pointer')` 切换。
- 完整的鼠标/触摸说明见 `docs/pointer.md`。

## 3. 保留输入（游戏收不到）

| 输入 | 行为 |
|---|---|
| Guide / Home 键 | 打开系统菜单（继续 / 金手指 / 设置 / 成就 / 退出） |
| 长按 `start` + `select` 1 秒 | 同上（很多 2.4G 手柄没有 Home 键） |
| `Esc` / 遥控器"返回"键 | 游戏中：打开系统菜单；菜单/面板中：返回上一级；货架中：无 |

系统菜单是游戏内的唯一入口。菜单项和面板都只读 P1 的 `PadState`：
方向键/摇杆移动，`A` 确认，`B` 返回；键盘的 Enter/Space 与 Esc 走同一条路。
鼠标仍然可以点，HUD 上的「菜单」只是鼠标捷径，不是另一套逻辑。

**给玩家的提示**：进入游戏后 HUD 只保留一个「菜单」按钮；开始页会写清
"按 Esc，或长按 Start + Select 打开菜单"。不要依赖玩家记得组合键。

系统菜单打开时，游戏的 `update` 暂停，输入只发往菜单。

## 4. Android 原生输入桥（`native/android`）

见 decisions.md D4：Android WebView 中的 Gamepad API 不可靠，原生桥是主要输入路径。

**拦截点**：`MainActivity` 覆写 `dispatchKeyEvent` 和 `dispatchGenericMotionEvent`，交给插件 `HearthInput` 处理。

**判断是否是手柄**：`event.source` 包含 `InputDevice.SOURCE_GAMEPAD` 或 `SOURCE_JOYSTICK`。来自遥控器（`SOURCE_DPAD` / `SOURCE_KEYBOARD`）的事件**放行**，让 WebView 正常生成 DOM 键盘事件。

**映射**

| Android | Button |
|---|---|
| `KEYCODE_BUTTON_A / B / X / Y` | south / east / west / north |
| `KEYCODE_BUTTON_L1 / R1` | l1 / r1 |
| `KEYCODE_BUTTON_L2 / R2` | l2 / r2（数字扳机） |
| `KEYCODE_BUTTON_THUMBL / THUMBR` | l3 / r3 |
| `KEYCODE_BUTTON_START / SELECT` | start / select |
| `KEYCODE_BUTTON_MODE` | Guide（保留） |
| `KEYCODE_DPAD_*`（来自手柄） | up / down / left / right |

| 轴 | 含义 |
|---|---|
| `AXIS_X / AXIS_Y` | 左摇杆 |
| `AXIS_Z / AXIS_RZ` | 右摇杆（多数手柄） |
| `AXIS_HAT_X / AXIS_HAT_Y` | D-pad（以轴形式上报的手柄） |
| `AXIS_LTRIGGER / AXIS_RTRIGGER`，备用 `AXIS_BRAKE / AXIS_GAS` | 扳机 |

右摇杆在少数手柄上是 `AXIS_RX / AXIS_RY`，靠设备 profile 修正。死区下限参考 `InputDevice.MotionRange.flat`。

**吞事件**：被识别为手柄的事件，插件处理后返回 `true`，阻止 WebView 用 D-pad 移动焦点，也阻止 `BUTTON_B` 被系统转成 `BACK`。

**传给 JS**：

- 按键：立即通过 `notifyListeners('pad', …)` 推送，带设备 id 与时间戳。
- 轴：在原生侧合并，每个 `Choreographer` 帧最多推送一次，减少跨桥调用。
- 连接/断开：通过 `InputManager.InputDeviceListener` 推送。
- JS 侧 `AndroidNativeSource` 把事件放进队列，由 `drain()` 消费。

**延迟目标**：原生到 JS 的跨桥延迟 p99 < 4ms。这是本项目定的预算，不是有出处的基准——Capacitor 的 `notifyListeners` 最终在 WebView 内执行 JS，官方文档没有性能数据，所以这是 M0 必须实测的一项。超标就改为 `addJavascriptInterface` 同步拉取一份紧凑状态，而不是每事件推送。

**震动**：`InputDevice.getVibratorManager()`（API 31+）或 `getVibrator()`。很多 2.4G 手柄没有震动马达，`rumble` 必须是"尽力而为"。

## 5. Windows / Web

- `WebGamepadSource` 每次 update 调用一次 `navigator.getGamepads()`（只在安全上下文中可用，见 D3）。
- `mapping === 'standard'`（XInput 手柄通常如此）：直接使用标准索引。
- 非 standard（DInput 手柄）：从 `gamepad.id` 解析 VID/PID，查设备 profile；查不到则进入设置里的"校准向导"，逐个按键记录映射。
- 设备 profile 的初始数据可以从 SDL GameControllerDB 转换而来（zlib 许可，转换后需保留许可说明）。
- 震动：`gamepad.vibrationActuator?.playEffect('dual-rumble', …)`，存在才调用。
- Gamepad API 在用户与页面交互前不暴露手柄：货架显示"按任意键开始"。

## 6. 键盘与遥控器

- 遥控器在 WebView 中表现为键盘事件：方向键、Enter（OK）、Escape/Back。
- PC 开发时的默认键盘映射：方向键 / WASD → 方向，J/K/U/I → south/east/west/north，Enter → start，Shift → select，Q/E → l1/r1。
- 货架 UI **只消费 runtime 的 PadState**，不直接监听 DOM 键盘事件，所以手柄、遥控器、键盘在 UI 中的行为完全一致。

## 7. M0 验证清单（在目标电视与 PC 上逐项记录）

必须实测（网上没有你这只手柄的数据）：

- [ ] 记录 `InputDevice` 名称、VID/PID、`getMotionRanges()` 的完整轴列表
- [ ] 右摇杆实际走 `AXIS_Z/RZ`（Android 文档所述）还是 `AXIS_RX/RY`（部分杂牌手柄）
- [ ] 扳机走 `AXIS_LTRIGGER/RTRIGGER`、`AXIS_GAS/BRAKE`，还是只上报 `KEYCODE_BUTTON_L2/R2`
- [ ] D-pad 以 keycode 还是 `AXIS_HAT_X/Y` 上报，有没有多余的幽灵轴
- [ ] 原生到 JS 的跨桥延迟（中位数 / p99），与 4ms 预算对比
- [ ] 通过手柄按键能否解锁 `AudioContext`（不能则改为"按 OK 开始"）

只需确认行为符合预期（机制已有文档或平台保证）：

- [ ] B 键不退出应用、D-pad 不移动 WebView 焦点（事件被插件消费）
- [ ] 遥控器方向键/OK/返回产生 DOM 键盘事件
- [ ] WebView 中 `navigator.getGamepads()` 的实际表现（预期为空或残缺，仅记录）
- [ ] PC 上 Chrome/Edge 中该手柄的 `id` 与 `mapping`
