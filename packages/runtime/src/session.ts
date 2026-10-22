import type {
  AudioApi,
  GameContext,
  GameInstance,
  GameManifest,
  InputView,
  PlatformInfo,
  StorageApi,
} from '@hearthbox/sdk';
import type { Audio } from './audio.js';
import { createAssetLoader } from './assets.js';
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

      const ctx: GameContext = {
        ctx2d: display.ctx,
        width: display.width,
        height: display.height,
        input: inputView,
        assets,
        audio: audioApi,
        storage: storageApi,
        platform,
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
            if (gameInput.systemMenuRequested()) {
              if (loop) loop.paused = true;
              instance?.pause?.();
              startOptions.onSystemMenu?.();
              return;
            }
            instance?.update(1 / 60);
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
      // 退出必须立刻落盘，不能等节流窗口。
      await flush().catch(() => {});

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
