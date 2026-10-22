/**
 * IndexedDB 封装。
 *
 * 不用 idb 也能写完这几十行，所以这里不引入依赖（compatibility.md 第 6 节：
 * 能用 50 行自己写完的不引入）。数据库名与对象库定义见 package-format.md 第 6 节。
 */

export const DB_NAME = 'hearthbox';
/**
 * 数据库版本。
 *
 * 2：新增 `cheats` 对象库（金手指开关状态）。
 *
 * 升级只允许"新增版本号 + onupgradeneeded 里补建库"，禁止删除重建
 * （见 runtime-api.md 第 7 节）。已有的存档与已安装游戏不能因为升级丢失。
 */
export const DB_VERSION = 2;

export type StoreName =
  | 'files'
  | 'installs'
  | 'saves'
  | 'settings'
  | 'profiles'
  | 'catalog-cache'
  /** 金手指开关状态：键是 `[gameId, cheatId]`，值是布尔。 */
  | 'cheats';

export interface Storage {
  get<T>(store: StoreName, key: IDBValidKey): Promise<T | undefined>;
  put(store: StoreName, key: IDBValidKey, value: unknown): Promise<void>;
  delete(store: StoreName, key: IDBValidKey): Promise<void>;
  /** 在一个事务里执行多步，任何异常都回滚。 */
  transaction<T>(
    stores: StoreName[],
    mode: IDBTransactionMode,
    fn: (tx: IDBTransaction) => Promise<T>,
  ): Promise<T>;
  /** 所有键；用于按游戏 id 前缀清理。 */
  keys(store: StoreName): Promise<IDBValidKey[]>;
  clear(store: StoreName): Promise<void>;
  close(): void;
}

export interface StorageConfig {
  /** 注入 IndexedDB 实现，测试用 fake-indexeddb。 */
  factory?: IDBFactory | undefined;
  name?: string | undefined;
  version?: number | undefined;
}

const STORES: StoreName[] = [
  'files',
  'installs',
  'saves',
  'settings',
  'profiles',
  'catalog-cache',
  'cheats',
];

export function openStorage(config: StorageConfig = {}): Promise<Storage> {
  const factory = config.factory ?? indexedDB;
  const name = config.name ?? DB_NAME;
  const version = config.version ?? DB_VERSION;

  return new Promise<Storage>((resolve, reject) => {
    const request = factory.open(name, version);

    request.onupgradeneeded = () => {
      const db = request.result;
      for (const store of STORES) {
        if (!db.objectStoreNames.contains(store)) {
          db.createObjectStore(store);
        }
      }
    };

    request.onerror = () => reject(request.error ?? new Error('IndexedDB open failed'));
    request.onsuccess = () => resolve(wrap(request.result));
  });
}

function wrap(db: IDBDatabase): Storage {
  function requestToPromise<T>(request: IDBRequest<T>): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error ?? new Error('IndexedDB request failed'));
    });
  }

  /** 写操作：请求失败立刻中止整个事务，避免后续请求落在同一个死事务上。 */
  async function write(
    store: StoreName,
    run: (objectStore: IDBObjectStore) => IDBRequest,
  ): Promise<void> {
    const tx = db.transaction(store, 'readwrite');
    const request = run(tx.objectStore(store));
    try {
      await requestToPromise(request);
      await transactionDone(tx);
    } catch (error) {
      try {
        tx.abort();
      } catch {
        // 事务可能已经结束。
      }
      throw error;
    }
  }

  return {
    async get<T>(store: StoreName, key: IDBValidKey): Promise<T | undefined> {
      const tx = db.transaction(store, 'readonly');
      return requestToPromise<T | undefined>(
        tx.objectStore(store).get(key) as IDBRequest<T | undefined>,
      );
    },
    async put(store: StoreName, key: IDBValidKey, value: unknown): Promise<void> {
      await write(store, (objectStore) => objectStore.put(value, key));
    },
    async delete(store: StoreName, key: IDBValidKey): Promise<void> {
      await write(store, (objectStore) => objectStore.delete(key));
    },
    async transaction<T>(
      stores: StoreName[],
      mode: IDBTransactionMode,
      fn: (tx: IDBTransaction) => Promise<T>,
    ): Promise<T> {
      const tx = db.transaction(stores, mode);
      try {
        const result = await fn(tx);
        await transactionDone(tx);
        return result;
      } catch (error) {
        // fn 里的异常必须真的回滚：不 abort 的话前面的写会留在库里。
        try {
          tx.abort();
        } catch {
          // 事务可能已经结束，忽略。
        }
        throw error;
      }
    },
    async keys(store: StoreName): Promise<IDBValidKey[]> {
      const tx = db.transaction(store, 'readonly');
      return requestToPromise(tx.objectStore(store).getAllKeys());
    },
    async clear(store: StoreName): Promise<void> {
      await write(store, (objectStore) => objectStore.clear());
    },
    close(): void {
      db.close();
    },
  } satisfies Storage;
}

function transactionDone(tx: IDBTransaction): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error('IndexedDB transaction failed'));
    tx.onabort = () => reject(tx.error ?? new Error('IndexedDB transaction aborted'));
  });
}
