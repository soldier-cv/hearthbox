import type {
  AudioApi,
  CheatDefinition,
  DebugApi,
  GameContext,
  GameInstance,
  GameManifest,
  InputView,
  PlatformInfo,
  Random,
} from '@hearthbox/sdk';
import type { Audio } from './audio.js';
import { createAssetLoader } from './assets.js';
import { createRandom, randomSeed } from './random.js';
import { createCheatStore, loadCheatState, type CheatStore } from './cheat-store.js';
import { createDebug } from './debug-api.js';
import type { Display } from './display.js';
import type { HostBridge } from './host.js';
import { createInput, type Input } from './input.js';
import { createLoop, type Loop } from './loop.js';
import { createSaveStore, type SaveStore } from './save-store.js';
import type { Storage } from './storage.js';

export interface SessionDeps {
  bridge: HostBridge;
  display: Display;
  audio: Audio;
  storage: Storage;
  sdkVersion: string;
  /** 游戏 id，用于存档命名空间。 */
  gameId: string;
  /** 调试设置，由宿主从 URL 或设置项解析后传入。 */
  debug?: {
    enabled?: boolean;
    seed?: number | null;
    timeScale?: number;
  };
  /** 注入时钟与 rAF，测试时手动推进。 */
  now?: () => number;
  requestFrame?: ((cb: (time: number) => void) => number) | undefined;
  cancelFrame?: ((handle: number) => void) | undefined;
}

export interface SessionStartOptions {
  manifest: GameManifest;
  create(ctx: GameContext): GameInstance | Promise<GameInstance>;
  /** 包内相对路径 → 可 fetch 的 blob URL。 */
  resolveAsset(path: string): string;
  /** 游戏退出。 */
  onExit(): void;
  /** 打开系统菜单（Guide 或 start+select 长按）。 */
  onSystemMenu?(): void;
}

export interface Session {
  start(options: SessionStartOptions): Promise<void>;
  stop(): Promise<void>;
  /** 关闭系统菜单后恢复游戏。 */
  resume(): void;
  /** 打开系统菜单时暂停游戏（不停止循环，仍渲染）。 */
  pause(): void;
  /**
   * 立刻发起存档写入。
   *
   * 页面卸载时调用：`beforeunload` 等不了异步，但可以同步发 IndexedDB 写请求。
   * 不调这个，玩家直接关标签页就可能丢进度。
   */
  flushNow(): void;
  /**
   * 切换金手指。boolean 型传 true/false，number 型传数值（平台会夹取）。
   *
   * 金手指面板与设置页用它。**写入只发生在平台侧**，游戏只读
   * `ctx.cheats.enabled()` / `ctx.cheats.value()`，这样"谁拥有状态"
   * 始终只有一处。
   */
  setCheat(id: string, value: boolean | number): void;
  /** 读当前值。boolean 型返回 boolean，number 型返回 number。 */
  getCheat(id: string): boolean | number | undefined;
  /** 当前已声明的金手指（游戏 create 之后才有内容）。 */
  readonly cheats: readonly CheatDefinition[];
  /**
   * 订阅金手指变化。面板打开时挂上，关闭时取消。
   *
   * 返回取消函数。回调在任意线程（微任务）里触发，面板要自己防抖重绘。
   */
  onCheatsChange(listener: () => void): () => void;
  /** 当前游戏实例，未启动时为 null。 */
  readonly instance: GameInstance | null;
  readonly running: boolean;
}

interface ContextDeps {
  display: Display;
  audio: Audio;
  saves: SaveStore;
  cheats: CheatStore;
  inputView: InputView;
  debug: DebugApi;
  random: Random;
  bridge: HostBridge;
  sdkVersion: string;
  resolveAsset: (path: string) => string;
  onExit: () => void;
}

/** 组装游戏看到的 ctx。这一步没有状态，纯粹是接线，单独放便于阅读。 */
function buildContext(deps: ContextDeps): GameContext {
  const { display, audio, saves, cheats, inputView, bridge, random } = deps;
  return {
    ctx2d: display.ctx,
    width: display.width,
    height: display.height,
    input: inputView,
    assets: createAssetLoader(deps.resolveAsset, audio),
    audio: { ctx: audio.ctx, music: audio.music, sfx: audio.sfx } satisfies AudioApi,
    storage: saves.api,
    platform: {
      shell: bridge.kind,
      sdkVersion: deps.sdkVersion,
      locale: typeof navigator !== 'undefined' ? navigator.language : 'zh-CN',
    } satisfies PlatformInfo,
    cheats: cheats.api,
    random: random,
    debug: deps.debug,
    exit: deps.onExit,
    rumble(strong, weak, ms) {
      bridge.rumble?.(0, strong, weak, ms);
    },
    setPointerMode(mode) {
      display.setPointerMode(mode);
    },
  };
}

/** 一次游戏会话：加载、跑帧、暂停、退出。 */
export function createSession(deps: SessionDeps): Session {
  const { bridge, display, audio, storage, gameId } = deps;
  const now = deps.now ?? (() => performance.now());

  let instance: GameInstance | null = null;
  let input: Input | null = null;
  let loop: Loop | null = null;
  let unsubscribeLifecycle: (() => void) | null = null;
  let running = false;
  let saves: SaveStore | null = null;
  let cheats: CheatStore | null = null;

  const debug = createDebug(deps.debug);

  function startLoop(gameInput: Input, options: SessionStartOptions): void {
    const gameLoop = createLoop(
      {
        update() {
          gameInput.sample();

          // 调试：手动步进模式下只有待推步数时才真正跑 update。
          if (!debug.shouldStep()) return;

          if (gameInput.systemMenuRequested()) {
            gameLoop.paused = true;
            instance?.pause?.();
            options.onSystemMenu?.();
            return;
          }

          cheats?.beginFrame();
          debug.tick();
          instance?.update((1 / 60) * debug.timeScale);
        },
        render(alpha) {
          instance?.render(alpha);
        },
      },
      {
        requestFrame: deps.requestFrame,
        cancelFrame: deps.cancelFrame,
        onError(error) {
          void session.stop().catch(() => {});
          throw error;
        },
      },
    );
    loop = gameLoop;

    unsubscribeLifecycle = bridge.onLifecycle((event) => {
      if (event === 'pause') {
        gameLoop.paused = true;
        instance?.pause?.();
        void saves?.flush().catch(() => {});
        void audio.suspend();
        return;
      }
      gameLoop.paused = false;
      instance?.resume?.();
    });

    bridge.keepAwake(true);
    gameLoop.start();
  }
  const session: Session = {
    get instance() {
      return instance;
    },
    get running() {
      return running;
    },
    get cheats() {
      return cheats?.declared ?? [];
    },

    async start(options) {
      if (running) return;
      running = true;

      saves = createSaveStore(storage, gameId);
      await saves.load();

      cheats = createCheatStore(storage, gameId, await loadCheatState(storage, gameId));

      const gameInput = createInput({
        sources: bridge.inputSources(),
        now,
        // 鼠标坐标必须经显示层换算，否则点了画布左上角却在逻辑坐标里漂。
        clientToLogical: (x, y) => display.clientToLogical(x, y),
      });
      input = gameInput;
      for (const source of bridge.inputSources()) source.start();

      const inputView: InputView = {
        get p1() {
          return gameInput.players()[0]!;
        },
        get players() {
          return gameInput.players();
        },
        keyboard: gameInput.keyboard(),
        pointer: gameInput.pointer(),
      };

      // 初始指针形态由游戏清单声明；缺省视为需要指针。
      display.setPointerMode(options.manifest.pointer ?? 'visible');

      const ctx = buildContext({
        display,
        audio,
        saves,
        cheats,
        inputView,
        debug: debug.api,
        // 种子优先取调试参数；没有就用时间戳，至少能知道那次运行的起点。
        random: createRandom(deps.debug?.seed ?? randomSeed()),
        bridge,
        sdkVersion: deps.sdkVersion,
        resolveAsset: options.resolveAsset,
        onExit: options.onExit,
      });

      instance = await options.create(ctx);
      startLoop(gameInput, options);
    },

    resume() {
      if (!running) return;
      if (loop) loop.paused = false;
      instance?.resume?.();
    },

    pause() {
      if (!running) return;
      if (loop) loop.paused = true;
      instance?.pause?.();
    },

    flushNow() {
      if (!running) return;
      saves?.flushNow();
      cheats?.flushNow();
    },

    setCheat: (id, value) => cheats?.set(id, value),
    getCheat: (id) => cheats?.get(id),
    onCheatsChange: (listener) => cheats?.subscribe(listener) ?? (() => {}),

    async stop() {      if (!running) return;
      running = false;

      loop?.stop();
      loop = null;

      unsubscribeLifecycle?.();
      unsubscribeLifecycle = null;

      // 退出必须立刻落盘，不能等节流窗口。
      await saves?.flush().catch(() => {});
      await cheats?.flush().catch(() => {});

      instance?.dispose?.();
      instance = null;

      if (input) {
        for (const source of bridge.inputSources()) source.stop();
        input = null;
      }

      saves?.reset();
      cheats?.reset();

      bridge.keepAwake(false);
      void audio.suspend();
    },
  };

  return session;
}
