import type { StorageApi } from '@hearthbox/sdk';
import type { Storage } from './storage.js';

/** 存档合并落盘的最小间隔。 */
const FLUSH_DELAY = 1000;

export interface SaveStore {
  /** 交给游戏的同步读写接口。 */
  readonly api: StorageApi;
  /** 立刻落盘并等待完成，正常退出时用。 */
  flush(): Promise<void>;
  /** 同步发起写入，页面卸载时用。 */
  flushNow(): void;
  /** 读回该游戏的全部存档。 */
  load(): Promise<void>;
  /** 换游戏时清空。 */
  reset(): void;
}

/**
 * 存档：内存副本同步读写，异步合并落盘。
 *
 * 为什么要内存副本：游戏在 `update` 里同步读写，不能每帧都去碰 IndexedDB。
 * 为什么要节流：频繁写盘在低端 Android TV 上会掉帧。
 * 为什么还要 flushNow：页面卸载等不了异步，必须同步发一次写请求。
 */
export function createSaveStore(storage: Storage, gameId: string): SaveStore {
  const values = new Map<string, unknown>();
  const dirty = new Set<string>();
  let timer: ReturnType<typeof setTimeout> | null = null;

  const keyOf = (key: string): [string, string] => [gameId, key];

  function schedule(): void {
    if (timer !== null) return;
    timer = setTimeout(() => {
      timer = null;
      void flush().catch(() => {});
    }, FLUSH_DELAY);
  }

  async function flush(): Promise<void> {
    if (dirty.size === 0) return;
    const keys = [...dirty];
    dirty.clear();
    for (const key of keys) {
      try {
        const value = values.get(key);
        if (value === undefined) {
          await storage.delete('saves', keyOf(key));
        } else {
          await storage.put('saves', keyOf(key), value);
        }
      } catch {
        // 写失败的键留到下次；不让一个键连累其他键。
        dirty.add(key);
      }
    }
  }

  const api: StorageApi = {
    get<T>(key: string): T | undefined {
      return values.get(key) as T | undefined;
    },
    set(key, value) {
      values.set(key, value);
      dirty.add(key);
      schedule();
    },
    delete(key) {
      values.delete(key);
      dirty.add(key);
      schedule();
    },
  };

  return {
    api,
    flush,
    flushNow() {
      for (const key of dirty) {
        const value = values.get(key);
        if (value === undefined) continue;
        storage.putNow('saves', keyOf(key), value);
      }
      dirty.clear();
    },
    async load() {
      // 键是复合键 [gameId, key]（见 package-format.md 第 6 节）。
      // 不能按字符串前缀扫：IDBValidKey 的数组键不会变成 "id\0key"。
      const allKeys = await storage.keys('saves');
      for (const key of allKeys) {
        if (!Array.isArray(key) || key.length !== 2 || key[0] !== gameId) continue;
        const sub = key[1];
        if (typeof sub !== 'string') continue;
        const value = await storage.get<unknown>('saves', key);
        if (value !== undefined) values.set(sub, value);
      }
    },
    reset() {
      if (timer !== null) {
        clearTimeout(timer);
        timer = null;
      }
      values.clear();
      dirty.clear();
    },
  };
}
