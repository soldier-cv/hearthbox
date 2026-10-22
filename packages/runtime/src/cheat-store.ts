import type { CheatsApi, CheatDefinition } from '@hearthbox/sdk';
import { resolveCheats } from './cheats.js';
import type { Storage } from './storage.js';

/** 存档合并落盘的最小间隔。 */
const FLUSH_DELAY = 1000;

export interface CheatStore {
  /** 交给游戏的只读接口。 */
  readonly api: CheatsApi;
  /** 平台侧切换开关。 */
  readonly set: (id: string, enabled: boolean) => void;
  readonly declared: readonly CheatDefinition[];
  /** 本帧刚从关变开的 id。 */
  beginFrame(): void;
  /** 同步发起写入，页面卸载时用。 */
  flushNow(): void;
  /** 等待写入完成，正常退出时用。 */
  flush(): Promise<void>;
  /** 换游戏时清空，避免上一个游戏的开关串到下一个。 */
  reset(): void;
}

/**
 * 金手指状态：与存档分开存。
 *
 * 分开的理由见 docs/cheats.md：卸载游戏不该清掉玩家关过哪些作弊，
 * 否则重装后又全打开了。
 */
export function createCheatStore(
  storage: Storage,
  gameId: string,
  saved: Record<string, boolean>,
): CheatStore {
  const declared: CheatDefinition[] = [];
  const declaredIds = new Set<string>();
  const state = new Map<string, boolean>();
  const previous = new Map<string, boolean>();
  const justEnabled = new Set<string>();
  const dirty = new Set<string>();

  let timer: ReturnType<typeof setTimeout> | null = null;

  function schedule(): void {
    if (timer !== null) return;
    timer = setTimeout(() => {
      timer = null;
      void flush().catch(() => {});
    }, FLUSH_DELAY);
  }

  async function flush(): Promise<void> {
    if (dirty.size === 0) return;
    const ids = [...dirty];
    dirty.clear();
    for (const id of ids) {
      try {
        await storage.put('cheats', [gameId, id], state.get(id) === true);
      } catch {
        // 写失败的键留到下次；不让它连累其他键。
        dirty.add(id);
      }
    }
  }

  const api: CheatsApi = {
    declare(definition) {
      if (declaredIds.has(definition.id)) {
        throw new Error(`金手指 id 重复：${definition.id}`);
      }
      declaredIds.add(definition.id);
      declared.push(definition);

      // 声明时才合并"已保存值 / 默认值"：游戏在 create() 里才声明。
      const resolved = resolveCheats([definition], saved);
      const enabled = resolved.get(definition.id) === true;
      state.set(definition.id, enabled);
      previous.set(definition.id, enabled);

      // 默认开启也要落盘，否则下次读回来就成了"没设置过"。
      if (definition.defaultEnabled === true && saved[definition.id] === undefined) {
        dirty.add(definition.id);
        schedule();
      }
    },
    enabled: (id) => state.get(id) === true,
    justEnabled: (id) => justEnabled.has(id),
    get all() {
      return declared;
    },
  };

  return {
    api,
    declared,
    set(id, enabled) {
      if (!state.has(id)) return;
      state.set(id, enabled);
      dirty.add(id);
      schedule();
    },
    beginFrame() {
      justEnabled.clear();
      for (const [id, enabled] of state) {
        if (enabled && previous.get(id) !== true) justEnabled.add(id);
        previous.set(id, enabled);
      }
    },
    flushNow() {
      for (const id of dirty) storage.putNow('cheats', [gameId, id], state.get(id) === true);
      dirty.clear();
    },
    flush,
    reset() {
      if (timer !== null) {
        clearTimeout(timer);
        timer = null;
      }
      // 保留 declared：设置页在游戏退出后仍要能看到"这个游戏有哪些金手指"。
      // 只清状态与待写队列。
      state.clear();
      previous.clear();
      justEnabled.clear();
      dirty.clear();
    },
  };
}

/** 读回某个游戏已保存的开关状态。 */
export async function loadCheatState(
  storage: Storage,
  gameId: string,
): Promise<Record<string, boolean>> {
  const keys = await storage.keys('cheats');
  const result: Record<string, boolean> = {};
  for (const key of keys) {
    if (!Array.isArray(key) || key.length !== 2 || key[0] !== gameId) continue;
    const cheatId = key[1];
    if (typeof cheatId !== 'string') continue;
    const value = await storage.get<boolean>('cheats', key);
    if (typeof value === 'boolean') result[cheatId] = value;
  }
  return result;
}
