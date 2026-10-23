import type { GameManifest } from '@hearthbox/sdk';
import { strFromU8, unzipSync } from 'fflate';
import type { Storage } from './storage.js';

/**
 * `.hbx` 安装。
 *
 * 目前只做本地/URL 导入：解压、校验、写 IndexedDB。catalog、签名和
 * 更新事务还没接。未签名包由导入页明确提示，只用于受信任来源。
 */

export const PACKAGE_MAX_BYTES = 200 * 1024 * 1024;
const MAX_FILES = 4000;
const MEDIA = new Set(['png', 'jpg', 'webp', 'gif', 'json', 'txt', 'ogg', 'mp3', 'wav']);
const ROOT_FILES = new Set(['game.json', 'game.js', 'icon.png', 'banner.png']);

export class InstallError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InstallError';
  }
}

export interface InstallRecord {
  id: string;
  version: string;
  name: string;
  summary: string;
  installedAt: number;
  /** 文件来源：文件名、URL，或 `github:owner/repo`。 */
  source: string;
  manifest: GameManifest;
  /** 包内全部路径，含 `game.json`、`game.js` 和素材。 */
  files: string[];
}

/** 解压并安装一个 `.hbx`。同 id 会原子替换旧版本，不动存档。 */
export async function installFromZip(
  storage: Storage,
  bytes: Uint8Array,
  source: string,
): Promise<InstallRecord> {
  if (bytes.byteLength > PACKAGE_MAX_BYTES) {
    throw new InstallError('包超过 200MB');
  }

  let problem: string | null = null;
  let total = 0;
  let count = 0;
  let unpacked: Record<string, Uint8Array>;

  try {
    unpacked = unzipSync(bytes, {
      filter(info) {
        if (info.name.endsWith('/')) return false;
        if (!isSafePath(info.name) || !isAllowed(info.name)) {
          problem = `包内文件不允许：${info.name}`;
          return false;
        }
        count += 1;
        total += info.originalSize;
        if (count > MAX_FILES) {
          problem = '包内文件数超过 4000';
          return false;
        }
        if (total > PACKAGE_MAX_BYTES) {
          problem = '解压后超过 200MB';
          return false;
        }
        return true;
      },
    });
  } catch (cause) {
    throw new InstallError(cause instanceof Error ? cause.message : String(cause));
  }

  if (problem) throw new InstallError(problem);

  const manifestBytes = unpacked['game.json'];
  if (!manifestBytes) throw new InstallError('缺少 game.json');
  if (!unpacked['game.js']) throw new InstallError('缺少 game.js');

  const parsed = parseManifest(manifestBytes);
  const manifest = parsed.manifest as GameManifest;
  const files = Object.keys(unpacked).sort();
  const previous = await getInstall(storage, manifest.id);

  const record: InstallRecord = {
    id: manifest.id,
    version: manifest.version,
    name: manifest.name,
    summary: parsed.summary,
    installedAt: Date.now(),
    source,
    manifest,
    files,
  };

  await storage.transaction(['files', 'installs'], 'readwrite', async (tx) => {
    const fileStore = tx.objectStore('files');
    const installStore = tx.objectStore('installs');
    const pending: Promise<unknown>[] = [];

    if (previous) {
      for (const path of previous.files) {
        pending.push(request(fileStore.delete([previous.id, previous.version, path])));
      }
    }

    for (const path of files) {
      const data = unpacked[path];
      if (!data) continue;
      const buffer = new Uint8Array(data).buffer;
      const blob = new Blob([buffer], { type: mimeOf(path) });
      pending.push(request(fileStore.put(blob, [manifest.id, manifest.version, path])));
    }

    pending.push(request(installStore.put(record, manifest.id)));
    await Promise.all(pending);
  });

  return record;
}

export async function listInstalled(storage: Storage): Promise<InstallRecord[]> {
  const keys = await storage.keys('installs');
  const records: InstallRecord[] = [];
  for (const key of keys) {
    const record = await storage.get<InstallRecord>('installs', key);
    if (record) records.push(record);
  }
  return records.sort((a, b) => a.name.localeCompare(b.name));
}

export async function getInstall(storage: Storage, id: string): Promise<InstallRecord | undefined> {
  return storage.get<InstallRecord>('installs', id);
}

export async function readInstalledFile(storage: Storage, id: string, path: string): Promise<Blob> {
  const record = await getInstall(storage, id);
  if (!record) throw new InstallError(`未安装：${id}`);
  const blob = await storage.get<Blob>('files', [record.id, record.version, path]);
  if (!blob) throw new InstallError(`包内缺少：${path}`);
  return blob;
}

export async function uninstallGame(storage: Storage, id: string): Promise<void> {
  const record = await getInstall(storage, id);
  if (!record) return;

  await storage.transaction(['files', 'installs'], 'readwrite', async (tx) => {
    const fileStore = tx.objectStore('files');
    const installStore = tx.objectStore('installs');
    const pending: Promise<unknown>[] = [];
    for (const path of record.files) {
      pending.push(request(fileStore.delete([record.id, record.version, path])));
    }
    pending.push(request(installStore.delete(id)));
    await Promise.all(pending);
  });
}

interface ParsedManifest {
  manifest: GameManifest & { summary?: string };
  summary: string;
}

function parseManifest(bytes: Uint8Array): ParsedManifest {
  let raw: unknown;
  try {
    raw = JSON.parse(strFromU8(bytes));
  } catch {
    throw new InstallError('game.json 不是合法 JSON');
  }

  if (!isRecord(raw)) throw new InstallError('game.json 不是对象');

  const id = requiredString(raw, 'id');
  if (!/^[a-z0-9][a-z0-9-]*\.[a-z0-9][a-z0-9-]*$/.test(id)) {
    throw new InstallError('game.json 的 id 不合法（应为小写点分）');
  }
  const name = requiredString(raw, 'name');
  requiredString(raw, 'version');
  requiredString(raw, 'sdk');
  if (raw['entry'] !== 'game.js') {
    throw new InstallError('game.json 的 entry 必须是 game.js');
  }
  requireDisplay(raw['display']);
  requirePlayers(raw['players']);
  requiredString(raw, 'license');

  const summaryRaw = raw['summary'];
  const summary = typeof summaryRaw === 'string' && summaryRaw.trim() !== '' ? summaryRaw : name;

  return { manifest: raw as unknown as ParsedManifest['manifest'], summary };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function requiredString(value: Record<string, unknown>, field: string): string {
  const raw = value[field];
  if (typeof raw !== 'string' || raw.trim() === '') {
    throw new InstallError(`game.json 缺少 ${field}`);
  }
  return raw;
}

function requireDisplay(value: unknown): void {
  if (!isRecord(value)) throw new InstallError('game.json 缺少 display');
  const width = value['width'];
  const height = value['height'];
  if (typeof width !== 'number' || typeof height !== 'number') {
    throw new InstallError('game.json 缺少 display.width/height');
  }
  if (!Number.isInteger(width) || !Number.isInteger(height) || width <= 0 || height <= 0) {
    throw new InstallError('display.width/height 必须是正整数');
  }
}

function requirePlayers(value: unknown): void {
  if (!isRecord(value)) throw new InstallError('game.json 缺少 players');
}

function isSafePath(path: string): boolean {
  if (path === '' || path.startsWith('/') || path.includes('\\') || path.includes(':')) {
    return false;
  }
  return path.split('/').every((part) => part !== '' && part !== '.' && part !== '..');
}

function isAllowed(path: string): boolean {
  if (ROOT_FILES.has(path)) return true;
  if (!path.startsWith('assets/')) return false;
  const ext = path.split('.').pop()?.toLowerCase() ?? '';
  return MEDIA.has(ext);
}

function mimeOf(path: string): string {
  const ext = path.split('.').pop()?.toLowerCase() ?? '';
  switch (ext) {
    case 'json':
      return 'application/json';
    case 'js':
      return 'text/javascript';
    case 'png':
      return 'image/png';
    case 'jpg':
      return 'image/jpeg';
    case 'webp':
      return 'image/webp';
    case 'gif':
      return 'image/gif';
    case 'ogg':
      return 'audio/ogg';
    case 'mp3':
      return 'audio/mpeg';
    case 'wav':
      return 'audio/wav';
    default:
      return 'text/plain';
  }
}

function request<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error('IndexedDB request failed'));
  });
}
