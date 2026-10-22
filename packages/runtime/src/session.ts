import type {
  AudioApi,
  CheatsApi,
  CheatDefinition,
  DebugApi,
  GameContext,
  GameInstance,
  GameManifest,
  InputView,
  PlatformInfo,
  StorageApi,
} from '@hearthbox/sdk';
import type { Audio } from './audio.js';
import { createAssetLoader } from './assets.js';
import { resolveCheats } from './cheats.js';
import { clampTimeScale } from './debug.js';
import type { Display } from './display.js';
import type { HostBridge } from './host.js';
import { createInput, type Input } from './input.js';
import { createLoop, type Loop } from './loop.js';
import type { Storage } from './storage.js';

/** 存档合并落盘的最小间隔，见 runtime-api.md 第 7 节。 */
const SAVE_THROTTLE_MS = 1000;

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
  requestFrame?: (cb: (time: number) => void) => number;
  cancelFrame?: (handle: number) => void;
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
  /**
   * 切换金手指开关。设置页与将来的金手指面板用它。
   *
   * 游戏侧只读 `ctx.cheats.enabled()`；写入只发生在平台侧，
   * 这样"谁拥有开关状态"始终只有一处。
   */
  setCheat(id: string, enabled: boolean): void;
  /** 当前已声明的金手指（游戏 create 之后才有内容）。 */
  readonly cheats: readonly CheatDefinition[];
  /** 当前游戏实例，未启动时为 null。 */
  readonly instance: GameInstance | null;
  readonly running: boolean;
}

export function createSession(deps: SessionDeps): Session {
  const { bridge, display, audio, storage, gameId } = deps;
  const now = deps.now ?? (() => performance.now());

  let instance: GameInstance | null = null;
  let input: Input | null = null;
  let loop: Loop | null = null;
  let unsubscribeLifecycle: (() => void) | null = null;
  let running = false;

  // 存档：内存副本同步读写，异步合并落盘。
  const saves = new Map<string, unknown>();
  const dirty = new Set<string>();
  let saveTimer: ReturnType<typeof setTimeout> | null = null;
  let lastFlush = 0;

  const saveKey = (key: string): [string, string] => [gameId, key];

  // 金手指开关：与存档分开落盘。卸载游戏不应清掉玩家关掉过哪些作弊，
  // 否则重装之后又全部打开了。
  const dirtyCheats = new Set<string>();
  let cheatTimer: ReturnType<typeof setTimeout> | null = null;
  const cheatStateRef: { current: Map<string, boolean> | null } = { current: null };

  /**
   * 金手指状态在会话层持有（不在 start() 作用域里），
   * 因为设置页会在游戏运行中随时调用 setCheat。
   */
  const declaredCheats: CheatDefinition[] = [];
  const declaredCheatIds = new Set<string>();
  let cheatState = new Map<string, boolean>();
  const previousCheatState = new Map<string, boolean>();
  const justEnabledIds = new Set<string>();
  let savedCheatValues: Record<string, boolean> = {};

  function applyCheat(id: string, enabled: boolean): void {
    if (!cheatState.has(id)) return;
    cheatState.set(id, enabled);
    dirtyCheats.add(id);
    scheduleFlushCheats();
  }

  async function loadCheatState(id: string): Promise<Record<string, boolean>> {
    const allKeys = await storage.keys('cheats');
    const result: Record<string, boolean> = {};
    for (const key of allKeys) {
      if (!Array.isArray(key) || key.length !== 2 || key[0] !== id) continue;
      const cheatId = key[1];
      if (typeof cheatId !== 'string') continue;
      const value = await storage.get<boolean>('cheats', key);
      if (typeof value === 'boolean') result[cheatId] = value;
    }
    return result;
  }

  function scheduleFlushCheats(): void {
    if (cheatTimer !== null) return;
    cheatTimer = setTimeout(() => {
      cheatTimer = null;
      void flushCheats().catch(() => {});
    }, SAVE_THROTTLE_MS);
  }

  async function flushCheats(): Promise<void> {
    if (dirtyCheats.size === 0) return;
    const state = cheatStateRef.current;
    if (!state) return;
    const ids = [...dirtyCheats];
    dirtyCheats.clear();
    for (const id of ids) {
      try {
        await storage.put('cheats', [gameId, id], state.get(id) === true);
      } catch {
        dirtyCheats.add(id);
      }
    }
  }
  function scheduleFlush(): void {
    if (saveTimer !== null) return;
    const delay = Math.max(0, SAVE_THROTTLE_MS - (now() - lastFlush));
    saveTimer = setTimeout(() => {
      saveTimer = null;
      void flush().catch(() => {});
    }, delay);
  }

  async function flush(): Promise<void> {
    if (dirty.size === 0) return;
    const keys = [...dirty];
    dirty.clear();
    lastFlush = now();
    for (const key of keys) {
      try {
        const value = saves.get(key);
        if (value === undefined) {
          await storage.delete('saves', saveKey(key));
        } else {
          await storage.put('saves', saveKey(key), value);
        }
      } catch (error) {
        dirty.add(key);
        throw error;
      }
    }
  }

  async function loadSaves(): Promise<void> {
    // 存档键是复合键 [gameId, key]（见 package-format.md 第 6 节）。
    // 不能按字符串前缀扫：IDBValidKey 的数组键不会变成 "id\0key"。
    const allKeys = await storage.keys('saves');
    const entries = await Promise.all(
      allKeys.map(async (key) => {
        if (!Array.isArray(key) || key.length !== 2 || key[0] !== gameId) return null;
        const saveKey = key[1];
        if (typeof saveKey !== 'string') return null;
        const value = await storage.get<unknown>('saves', key);
        return [saveKey, value] as const;
      }),
    );
    for (const entry of entries) {
      if (entry && entry[1] !== undefined) saves.set(entry[0], entry[1]);
    }
  }

  const storageApi: StorageApi = {
    get<T>(key: string): T | undefined {
      return saves.get(key) as T | undefined;
    },
    set(key, value) {
      saves.set(key, value);
      dirty.add(key);
      scheduleFlush();
    },
    delete(key) {
      saves.delete(key);
      dirty.add(key);
      scheduleFlush();
    },
  };

  const assets = createAssetLoader((path) => options?.resolveAsset(path) ?? '', audio);
  let options: SessionStartOptions | null = null;

  const session: Session = {
    get instance() {
      return instance;
    },
    get running() {
      return running;
    },
    get cheats() {
      return declaredCheats;
    },
    setCheat(id, enabled) {
      applyCheat(id, enabled);
    },

    async start(startOptions) {
      if (running) return;
      options = startOptions;
      running = true;

      await loadSaves();

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

      // 初始指针形态由游戏清单声明；缺省视为需要指针（小游戏更像"网页"）。
      display.setPointerMode(startOptions.manifest.pointer ?? 'visible');

      const audioApi: AudioApi = { ctx: audio.ctx, music: audio.music, sfx: audio.sfx };
      const platform: PlatformInfo = {
        shell: bridge.kind,
        sdkVersion: deps.sdkVersion,
        locale: typeof navigator !== 'undefined' ? navigator.language : 'zh-CN',
      };

      // 金手指：游戏声明、平台持有开关。状态按 [gameId, cheatId] 持久化。
      savedCheatValues = await loadCheatState(gameId);
      declaredCheats.length = 0;
      declaredCheatIds.clear();
      cheatState = new Map<string, boolean>();
      previousCheatState.clear();
      justEnabledIds.clear();
      cheatStateRef.current = cheatState;

      const cheatsApi: CheatsApi = {
        declare(definition) {
          if (declaredCheatIds.has(definition.id)) {
            throw new Error(`金手指 id 重复：${definition.id}`);
          }
          declaredCheatIds.add(definition.id);
          declaredCheats.push(definition);

          // 声明时才把"已保存值 / 默认值"合并进开关表：游戏在 create() 里才声明。
          const resolved = resolveCheats([definition], savedCheatValues);
          const enabled = resolved.get(definition.id) === true;
          cheatState.set(definition.id, enabled);
          previousCheatState.set(definition.id, enabled);

          // 默认开启也要落盘，否则下次读回来就成了"没设置过"。
          if (definition.defaultEnabled === true && savedCheatValues[definition.id] === undefined) {
            dirtyCheats.add(definition.id);
            scheduleFlushCheats();
          }
        },
        enabled: (id) => cheatState.get(id) === true,
        justEnabled: (id) => justEnabledIds.has(id),
        get all() {
          return declaredCheats;
        },
      };

      // 调试口子：关闭时所有方法都是空操作。
      const debugEnabled = deps.debug?.enabled === true;
      const debugTimeScale = clampTimeScale(deps.debug?.timeScale ?? 1);
      const frameCallbacks = new Set<(frame: number) => void>();
      let frameCount = 0;
      let manualPause = false;
      let pendingSteps = 0;

      const debugApi: DebugApi = {
        enabled: debugEnabled,
        seed: deps.debug?.seed ?? null,
        timeScale: debugTimeScale,
        onFrame(callback) {
          if (!debugEnabled) return () => {};
          frameCallbacks.add(callback);
          return () => frameCallbacks.delete(callback);
        },
        stepFrames(count) {
          if (!debugEnabled) return;
          manualPause = true;
          pendingSteps += Math.max(0, Math.floor(count));
        },
        get paused() {
          return manualPause;
        },
        resume() {
          manualPause = false;
          pendingSteps = 0;
        },
      };

      const ctx: GameContext = {
        ctx2d: display.ctx,
        width: display.width,
        height: display.height,
        input: inputView,
        assets,
        audio: audioApi,
        storage: storageApi,
        platform,
        cheats: cheatsApi,
        debug: debugApi,
        exit: () => startOptions.onExit(),
        rumble(strong, weak, ms) {
          bridge.rumble?.(0, strong, weak, ms);
        },
        setPointerMode(mode) {
          display.setPointerMode(mode);
        },
      };

      instance = await startOptions.create(ctx);

      const gameLoop = createLoop(
        {
          update() {
            gameInput.sample();

            // 调试：手动步进模式下，只有待处理的步数才真正跑 update。
            if (manualPause) {
              if (pendingSteps <= 0) return;
              pendingSteps -= 1;
            }

            if (gameInput.systemMenuRequested()) {
              if (loop) loop.paused = true;
              instance?.pause?.();
              startOptions.onSystemMenu?.();
              return;
            }

            // 金手指开关可能在两帧之间被改（设置页或调试面板），
            // 每帧算一次 justEnabled，游戏就能做"立刻生效"的一次性处理。
            justEnabledIds.clear();
            for (const [id, enabled] of cheatState) {
              if (enabled && previousCheatState.get(id) !== true) justEnabledIds.add(id);
              previousCheatState.set(id, enabled);
            }

            frameCount += 1;
            if (debugEnabled) {
              for (const callback of frameCallbacks) callback(frameCount);
            }

            instance?.update((1 / 60) * debugTimeScale);
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
          void flush().catch(() => {});
          void audio.suspend();
        } else {
          gameLoop.paused = false;
          instance?.resume?.();
        }
      });

      bridge.keepAwake(true);
      gameLoop.start();
    },

    resume() {
      if (!running) return;
      if (loop) loop.paused = false;
      instance?.resume?.();
    },

    async stop() {
      if (!running) return;
      running = false;

      loop?.stop();
      loop = null;

      unsubscribeLifecycle?.();
      unsubscribeLifecycle = null;

      if (saveTimer !== null) {
        clearTimeout(saveTimer);
        saveTimer = null;
      }
      if (cheatTimer !== null) {
        clearTimeout(cheatTimer);
        cheatTimer = null;
      }
      // 退出必须立刻落盘，不能等节流窗口。
      await flush().catch(() => {});
      await flushCheats().catch(() => {});

      instance?.dispose?.();
      instance = null;

      if (input) {
        for (const source of bridge.inputSources()) source.stop();
        input = null;
      }

      bridge.keepAwake(false);
      void audio.suspend();
    },
  };

  return session;
}
