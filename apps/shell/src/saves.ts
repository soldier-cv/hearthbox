import type { Storage } from '@hearthbox/runtime';

/**
 * 本地存档的导出/导入。
 *
 * 存档只存在本机 IndexedDB，不上云。导出的文件是可以自己备份、
 * 换设备或发给朋友的 JSON；导入会原子替换该游戏的全部存档键。
 */

export const SAVE_FORMAT = 'hearthbox-save';
export const SAVE_FORMAT_VERSION = 1;
export const SAVE_MAX_BYTES = 1024 * 1024;
const FORBIDDEN_KEYS = new Set(['__proto__', 'constructor', 'prototype']);

export interface SaveEnvelope {
  format: typeof SAVE_FORMAT;
  formatVersion: typeof SAVE_FORMAT_VERSION;
  gameId: string;
  gameVersion: string;
  savedAt: string;
  data: Record<string, unknown>;
}

export async function exportSaves(
  storage: Storage,
  gameId: string,
  gameVersion: string,
): Promise<SaveEnvelope> {
  const keys = await storage.keys('saves');
  const data: Record<string, unknown> = {};

  for (const key of keys) {
    if (!isGameKey(key, gameId)) continue;
    const value = await storage.get('saves', key);
    if (value !== undefined) data[key[1]] = value;
  }

  return {
    format: SAVE_FORMAT,
    formatVersion: SAVE_FORMAT_VERSION,
    gameId,
    gameVersion,
    savedAt: new Date().toISOString(),
    data,
  };
}

export async function importSaves(
  storage: Storage,
  raw: unknown,
  expectedGameId: string,
): Promise<SaveEnvelope> {
  const envelope = parseEnvelope(raw);
  if (envelope.gameId !== expectedGameId) {
    throw new Error(`存档属于 ${envelope.gameId}，不是当前游戏`);
  }

  const existing = (await storage.keys('saves')).filter((key) => isGameKey(key, expectedGameId));

  await storage.transaction(['saves'], 'readwrite', async (tx) => {
    const store = tx.objectStore('saves');
    const pending: Promise<unknown>[] = [];
    for (const key of existing) pending.push(request(store.delete(key)));
    for (const [key, value] of Object.entries(envelope.data)) {
      if (FORBIDDEN_KEYS.has(key)) continue;
      pending.push(request(store.put(value, [expectedGameId, key])));
    }
    await Promise.all(pending);
  });

  return envelope;
}

export function fileNameOf(envelope: SaveEnvelope): string {
  const stamp = envelope.savedAt.replace(/[:.]/g, '-');
  return `${envelope.gameId}-${stamp}.json`;
}

function parseEnvelope(raw: unknown): SaveEnvelope {
  if (!isRecord(raw)) throw new Error('存档文件不是对象');
  if (raw['format'] !== SAVE_FORMAT) throw new Error('不是炉边存档文件');
  if (raw['formatVersion'] !== SAVE_FORMAT_VERSION) {
    throw new Error(`不支持的存档格式版本：${String(raw['formatVersion'])}`);
  }
  if (typeof raw['gameId'] !== 'string' || raw['gameId'] === '') {
    throw new Error('存档缺少 gameId');
  }
  if (typeof raw['gameVersion'] !== 'string') {
    throw new Error('存档缺少 gameVersion');
  }
  if (typeof raw['savedAt'] !== 'string') {
    throw new Error('存档缺少 savedAt');
  }
  if (!isRecord(raw['data'])) throw new Error('存档缺少 data');

  const data: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(raw['data'])) {
    if (FORBIDDEN_KEYS.has(key)) continue;
    data[key] = value;
  }

  const envelope: SaveEnvelope = {
    format: SAVE_FORMAT,
    formatVersion: SAVE_FORMAT_VERSION,
    gameId: raw['gameId'],
    gameVersion: raw['gameVersion'],
    savedAt: raw['savedAt'],
    data,
  };

  const bytes = new TextEncoder().encode(JSON.stringify(envelope)).byteLength;
  if (bytes > SAVE_MAX_BYTES) {
    throw new Error(`存档超过 ${SAVE_MAX_BYTES / 1024}KB`);
  }
  return envelope;
}

function isGameKey(key: IDBValidKey, gameId: string): key is [string, string] {
  return (
    Array.isArray(key) &&
    key.length === 2 &&
    key[0] === gameId &&
    typeof key[1] === 'string' &&
    !FORBIDDEN_KEYS.has(key[1])
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function request<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error('IndexedDB request failed'));
  });
}
