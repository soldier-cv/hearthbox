import type { GameContext, GameInstance } from '@hearthbox/sdk';
import type { InputSource } from './input-source.js';

export type {
  InputSource,
  RawInputTarget,
  RawKeyboardState,
  RawPadState,
  RawPointerState,
} from './input-source.js';

/** 平台本体与壳之间唯一的接口。Web 壳与 Android 壳各有一个实现。 */
export interface HostBridge {
  readonly kind: 'web' | 'android-tv' | 'tauri';
  /** 平台提供哪些输入源。每个源由运行时代为 start/stop。 */
  inputSources(): InputSource[];
  /** 游戏启动时 true，退出时 false。拿不到唤醒锁时静默失败。 */
  keepAwake(on: boolean): void;
  /** 返回取消订阅函数。 */
  onLifecycle(cb: (event: 'pause' | 'resume') => void): () => void;
  /** 仅 Android：把整个壳退到后台或退出。 */
  exitApp?(): void;
  /** 尽力而为；缺失或不支持时调用方不做任何处理。 */
  rumble?(player: number, strong: number, weak: number, ms: number): void;
}

/** `import()` 一个游戏包得到的东西。 */
export interface GameModule {
  default: GameDefinition;
}

export interface GameDefinition {
  id: string;
  create(ctx: GameContext): GameInstance | Promise<GameInstance>;
}
