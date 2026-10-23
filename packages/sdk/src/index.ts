/**
 * Hearthbox 游戏契约。
 *
 * 零运行时依赖：只有类型和一个恒等函数 defineGame()。
 */

export type {
  BooleanOption,
  ChoiceOption,
  NumberOption,
  OptionBase,
  OptionDefinition,
  OptionKind,
  OptionScope,
  OptionValue,
  OptionsApi,
} from './options.js';

import type { OptionsApi } from './options.js';
/** 手柄按钮，按物理位置命名：不同手柄的 A/B/X/Y 标签不一致，位置才是稳定的。 */
export type Button =
  | 'south'
  | 'east'
  | 'west'
  | 'north'
  | 'l1'
  | 'r1'
  | 'l2'
  | 'r2'
  | 'l3'
  | 'r3'
  | 'start'
  | 'select'
  | 'up'
  | 'down'
  | 'left'
  | 'right';

/** 一帧内某个玩家的输入快照。对象由平台预分配并跨帧复用。 */
export interface PadState {
  readonly connected: boolean;
  /** 左摇杆，-1..1，已过径向死区并重新缩放。 */
  readonly lx: number;
  readonly ly: number;
  /** 右摇杆，-1..1。 */
  readonly rx: number;
  readonly ry: number;
  /** 左扳机，0..1。 */
  readonly lt: number;
  /** 右扳机，0..1。 */
  readonly rt: number;
  /** D-pad 与左摇杆合并后的移动向量，长度 ≤ 1。 */
  readonly move: { readonly x: number; readonly y: number };
  held(button: Button): boolean;
  /** 本次 update 中刚按下。 */
  pressed(button: Button): boolean;
  released(button: Button): boolean;
}

/** 一次指针事件的原始坐标与按钮状态，坐标由平台换算成逻辑像素。 */
export interface PointerState {
  /** 是否有指针设备（有鼠标、触摸屏或触控笔时为 true）。 */
  readonly connected: boolean;
  /** 指针是否在画布内。 */
  readonly inside: boolean;
  /** 逻辑坐标系下的位置，原点在画布左上角。 */
  readonly x: number;
  readonly y: number;
  /** 本帧是否移动过。 */
  readonly moved: boolean;
  /** 本帧内移动的相对量，逻辑像素。 */
  readonly dx: number;
  readonly dy: number;
  held(button: PointerButton): boolean;
  /** 本次 update 中刚按下。 */
  pressed(button: PointerButton): boolean;
  released(button: PointerButton): boolean;
  /** 自上次 update 以来的滚轮位移（逻辑像素，向下为正）。 */
  readonly wheel: number;
}

export type PointerButton = 'left' | 'middle' | 'right';

/**
 * 键盘状态。
 *
 * 用 `KeyboardEvent.code`（物理键位）查询，例如 `held('KeyA')`、`held('ArrowLeft')`。
 * 不用字符：同一个键在不同键盘布局下产生不同字符，而游戏要的是"那个键"。
 * 文本输入（输入框）不在 v1 范围，见 game-sdk.md。
 */
export interface KeyboardState {
  readonly connected: boolean;
  /** 本帧按住。 */
  held(code: string): boolean;
  /** 本次 update 中刚按下。 */
  pressed(code: string): boolean;
  /** 本次 update 中刚松开。 */
  released(code: string): boolean;
  /** 当前按住的所有键的快照；不要在 update 里保存引用。 */
  readonly heldCodes: readonly string[];
}

/** 游戏看到的输入视图。 */
export interface InputView {
  /** 玩家一，等价于 players[0]。 */
  readonly p1: PadState;
  /** 长度恒为 4，未连接的设备 connected=false。 */
  readonly players: readonly PadState[];
  /** 键盘。没有键盘输入时 `connected` 为 false。 */
  readonly keyboard: KeyboardState;
  /** 鼠标 / 触控。没有指针设备时 `connected` 为 false。 */
  readonly pointer: PointerState;
}

/** 已解码的图片；预留给以后细化（比如给 SVG 加尺寸约束）。 */
export type ImageAsset = HTMLImageElement;

export interface AssetLoader {
  /** 相对包内 assets/。返回时已 decode，可直接绘制。 */
  image(path: string): Promise<ImageAsset>;
  /** 相对包内 assets/。返回时已解码。 */
  audio(path: string): Promise<AudioBuffer>;
  json<T = unknown>(path: string): Promise<T>;
  text(path: string): Promise<string>;
  /** blob URL，仅用于特殊情况。退出时由平台统一撤销。 */
  url(path: string): string;
}

export interface AudioApi {
  /** 平台唯一的 AudioContext，latencyHint: 'interactive'。 */
  readonly ctx: AudioContext;
  /** 音乐总线，音量由平台设置控制。游戏不要直接接 ctx.destination。 */
  readonly music: GainNode;
  /** 音效总线。 */
  readonly sfx: GainNode;
}

export interface StorageApi {
  /** 同步，读内存副本。 */
  get<T>(key: string): T | undefined;
  /** 同步写入内存，异步落盘。值必须是可结构化克隆的纯数据。 */
  set(key: string, value: unknown): void;
  delete(key: string): void;
}

export interface PlatformInfo {
  readonly shell: 'android-tv' | 'web' | 'tauri';
  /** 平台提供的 SDK 版本。 */
  readonly sdkVersion: string;
  readonly locale: string;
}

export interface GameContext {
  /** 平台已按逻辑分辨率配置好的 2D 上下文，见 decisions.md D15。 */
  readonly ctx2d: CanvasRenderingContext2D;
  /** 逻辑像素宽，等于 game.json 声明值。 */
  readonly width: number;
  /** 逻辑像素高。 */
  readonly height: number;
  readonly input: InputView;
  readonly assets: AssetLoader;
  readonly audio: AudioApi;
  readonly storage: StorageApi;
  readonly platform: PlatformInfo;
  /**
   * 可调项：金手指、游戏设置、只读状态。
   *
   * **一套 API 覆盖三类面板**，用 `scope` 区分归属。见 docs/plugins.md。
   * 平台据此渲染控件、持久化、夹取越界值。
   */
  readonly options: OptionsApi;
  /**
   * 金手指常用方法的快捷入口，底层就是 `options`。
   */
  readonly cheats: CheatsApi;
  /**
   * 可设定种子的随机数。
   *
   * 用它而不是 `Math.random()`，就能靠 `debug.seed` 复现整局行为。
   * 平台不改 `Math.random`，因为它会污染同页面的其他代码。
   */
  readonly random: Random;
  /** 调试口子。默认关闭，关闭时所有方法都是空操作。 */
  readonly debug: DebugApi;
  /** 返回货架。 */
  exit(): void;
  /** 尽力而为，没有马达时静默。 */
  rumble(strong: number, weak: number, ms: number): void;
  /**
   * 请求指针形态。默认跟随 game.json 的 `pointer` 声明；
   * 需要在运行中切换（比如小游戏打开菜单）时调用。
   */
  setPointerMode(mode: PointerMode): void;
}

/** 指针在画面上的行为。 */
export type PointerMode =
  /** 隐藏系统指针，游戏自己画。适合全屏手柄游戏。 */
  | 'hidden'
  /** 显示系统指针（默认箭头）。适合点击类小游戏。 */
  | 'visible'
  /** 显示系统指针，并强制使用"手型"。适合可点区域很明确的界面。 */
  | 'pointer';

/** 可设定种子的随机数。用它而不是 `Math.random()`，才能靠 seed 复现整局行为。 */
export interface Random {
  /** [0, 1) 的浮点。 */
  next(): number;
  /** [min, max) 的整数。 */
  int(min: number, max: number): number;
  /** [min, max) 的浮点。 */
  float(min: number, max: number): number;
  /** 随机取一个元素。空数组返回 undefined。 */
  pick<T>(items: readonly T[]): T | undefined;
  /** 当前种子。复现时把它记下来即可重放同一串随机数。 */
  readonly seed: number;
}

/**
 * 金手指类型的快捷定义。
 *
 * 与 `OptionDefinition` 配 `scope: 'cheat'` 等价。
 */
export type CheatDefinition = BooleanCheat | NumberCheat;

export interface CheatBase {
  /** 稳定 id，游戏内唯一，发布后不要改。 */
  id: string;
  /** 玩家看到的名字。 */
  name: string;
  description?: string;
  /** 危险等级，缺省 `gameplay`。 */
  severity?: 'cosmetic' | 'gameplay' | 'destructive';
}

export interface BooleanCheat extends CheatBase {
  kind?: 'boolean';
  /** 默认是否启用，缺省 false。 */
  defaultEnabled?: boolean;
  /** 固定为金手指面板，可省略。 */
  scope?: 'cheat';
}

export interface NumberCheat extends CheatBase {
  kind: 'number';
  /** 最小值。 */
  min: number;
  /** 最大值。 */
  max: number;
  /** 步进，决定 UI 每次加减多少；须能整除 (max - min)。 */
  step: number;
  /** 默认值，须落在 [min, max] 内且符合 step。 */
  defaultValue: number;
  /** 单位，仅用于显示，如 '×'、'%'、's'。 */
  unit?: string;
  /** 固定为金手指面板，可省略。 */
  scope?: 'cheat';
}

export interface CheatsApi {
  /** 声明一个金手指（等价于 options.declare 且 scope 为 cheat）。 */
  declare(definition: CheatDefinition): void;

  /** 是否启用。boolean 型直接返回；number 型返回是否非默认值。 */
  enabled(id: string): boolean;
  /** 本帧内刚被切换为启用。用于"改完立即生效"的一次性逻辑。 */
  justEnabled(id: string): boolean;
  /**
   * 读数值。已夹在 [min, max] 并对齐到 step。
   *
   * 对 boolean 型 id 返回 0/1，不抛错 —— 把开关升级成数值时不用改调用点。
   */
  value(id: string): number;
  /** 全部已声明的金手指。 */
  readonly all: readonly CheatDefinition[];
}

/** 调试口子。默认关闭时所有方法都是空操作。 */
export interface DebugApi {
  readonly enabled: boolean;
  /** 固定随机种子；为 null 时游戏自己决定。 */
  readonly seed: number | null;
  /** update 的 dt 会乘以它，范围 0.05–4。 */
  readonly timeScale: number;
  /** 注册每帧回调，返回取消函数。 */
  onFrame(callback: (frame: number) => void): () => void;
  /** 暂停并手动推进 N 帧；非调试模式为空操作。 */
  stepFrames(count: number): void;
  readonly paused: boolean;
  /** 恢复自动推进。 */
  resume(): void;
}

export interface GameInstance {
  /** 固定 60Hz，dt 恒为 1/60。必须纯逻辑，不碰 DOM/Canvas。 */
  update(dt: number): void;
  /** 每个显示帧一次，alpha ∈ [0,1) 是距下一个 update 的插值系数。只做绘制。 */
  render(alpha: number): void;
  pause?(): void;
  resume?(): void;
  dispose?(): void;
}

export interface GameDefinition {
  /** 必须与 game.json 的 id 一致。 */
  id: string;
  create(ctx: GameContext): GameInstance | Promise<GameInstance>;
}

/** 声明一个游戏。返回入参本身，只提供类型约束。 */
export function defineGame(definition: GameDefinition): GameDefinition {
  return definition;
}

/** game.json 的形状，游戏作者基本只在构建配置里间接接触。 */
export interface GameManifest {
  id: string;
  name: string;
  version: string;
  sdk: string;
  entry: string;
  display: {
    width: number;
    height: number;
    pixelArt: boolean;
    scale: 'integer' | 'fit';
  };
  players: { min: number; max: number };
  /**
   * 这个游戏需要哪些输入。缺省为 `pad`。
   *
   * 货架据此显示"支持鼠标"等标识；运行时不据此禁用输入（玩家随时可能
   * 换设备），只决定初始指针形态与提示文案。
   */
  input?: readonly InputKind[];
  /** 初始指针形态，缺省 `visible`。`hidden` 适合纯手柄游戏。 */
  pointer?: PointerMode;
  license: string;
  assetsLicense?: string;
}

export type InputKind = 'pad' | 'keyboard' | 'pointer';

export type { GameManifest as Manifest };
