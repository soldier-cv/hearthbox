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
