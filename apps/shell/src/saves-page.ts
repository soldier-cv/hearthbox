import { openStorage, type Storage } from '@hearthbox/runtime';
import { exportSaves, fileNameOf, importSaves, type SaveEnvelope } from './saves.js';

const gameName = requireElement<HTMLElement>('#game-name');
const exportButton = requireElement<HTMLButtonElement>('#export');
const fileInput = requireElement<HTMLInputElement>('#file');
const status = requireElement<HTMLElement>('#status');

const params = new URLSearchParams(location.search);
const gameId = params.get('id') ?? '';
const name = params.get('name') ?? gameId;
const version = params.get('version') ?? '';

gameName.textContent = name;

if (gameId === '') {
  setStatus('地址里缺少游戏 id', 'error');
}

const storageReady = openStorage();
let storage: Storage | null = null;
void storageReady
  .then((opened) => {
    storage = opened;
  })
  .catch((cause: unknown) => setStatus(`存储打不开：${messageOf(cause)}`, 'error'));

exportButton.addEventListener('click', () => {
  void runExport();
});

fileInput.addEventListener('change', () => {
  const file = fileInput.files?.[0];
  if (file) void runImport(file);
});

async function runExport(): Promise<void> {
  if (gameId === '') return;
  try {
    const store = await getStorage();
    const envelope = await exportSaves(store, gameId, version);
    const blob = new Blob([JSON.stringify(envelope, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = fileNameOf(envelope);
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    setStatus('已导出。浏览器没弹下载的话，检查下载目录。', 'success');
  } catch (cause) {
    setStatus(messageOf(cause), 'error');
  }
}

async function runImport(file: File): Promise<void> {
  if (gameId === '') return;
  try {
    const text = await file.text();
    const raw: unknown = JSON.parse(text);
    const imported = raw as Partial<SaveEnvelope>;
    if (
      version !== '' &&
      typeof imported.gameVersion === 'string' &&
      imported.gameVersion !== '' &&
      imported.gameVersion !== version
    ) {
      const ok = confirm(
        `这个存档来自 ${imported.gameVersion}，当前游戏是 ${version}。\n` +
          '版本不同可能读不出来，仍然导入吗？',
      );
      if (!ok) {
        setStatus('已取消导入', 'normal');
        return;
      }
    }

    const store = await getStorage();
    const envelope = await importSaves(store, raw, gameId);
    setStatus(`已导入 ${Object.keys(envelope.data).length} 个键。返回货架重新进游戏。`, 'success');
  } catch (cause) {
    setStatus(messageOf(cause), 'error');
  } finally {
    fileInput.value = '';
  }
}

async function getStorage(): Promise<Storage> {
  if (storage) return storage;
  try {
    storage = await storageReady;
    return storage;
  } catch (cause) {
    throw new Error(`存储打不开：${messageOf(cause)}`);
  }
}

function setStatus(text: string, tone: 'normal' | 'error' | 'success' = 'normal'): void {
  status.textContent = text;
  status.dataset['tone'] = tone;
}

function messageOf(cause: unknown): string {
  return cause instanceof Error ? cause.message : String(cause);
}

function requireElement<T extends HTMLElement>(selector: string): T {
  const element = document.querySelector<T>(selector);
  if (!element) throw new Error(`saves.html 缺少 ${selector}`);
  return element;
}
