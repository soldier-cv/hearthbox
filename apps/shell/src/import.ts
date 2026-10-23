import {
  installFromZip,
  openStorage,
  PACKAGE_MAX_BYTES,
  type InstallRecord,
  type Storage,
} from '@hearthbox/runtime';

/**
 * 导入页。
 *
 * 只做一件事：把 `.hbx` 解压、校验、写进 IndexedDB。catalog、签名和沙箱
 * 还没接，所以这里明确提示"只导入信任的包"。
 */

const fileInput = requireElement<HTMLInputElement>('#file');
const urlInput = requireElement<HTMLInputElement>('#url');
const fetchButton = requireElement<HTMLButtonElement>('#fetch');
const status = requireElement<HTMLElement>('#status');

let storage: Storage | null = null;
let busy = false;
const storageReady = openStorage();
void storageReady
  .then((opened) => {
    storage = opened;
  })
  .catch((cause: unknown) => {
    setStatus(`存储打不开：${messageOf(cause)}`, 'error');
  });

fileInput.addEventListener('change', () => {
  const file = fileInput.files?.[0];
  if (file) void importFile(file);
});

fetchButton.addEventListener('click', () => {
  void importUrl(urlInput.value);
});

async function importFile(file: File): Promise<void> {
  if (busy) return;
  busy = true;
  setStatus(`正在读取 ${file.name}…`);
  try {
    const bytes = new Uint8Array(await file.arrayBuffer());
    await install(bytes, file.name);
  } catch (cause) {
    setStatus(messageOf(cause), 'error');
  } finally {
    busy = false;
    fileInput.value = '';
  }
}

async function importUrl(raw: string): Promise<void> {
  if (busy) return;
  const input = raw.trim();
  if (input === '') {
    setStatus('先填一个网址', 'error');
    return;
  }

  busy = true;
  fetchButton.disabled = true;
  try {
    const resolved = await resolveUrl(input);
    setStatus('正在下载…');
    const response = await fetch(resolved.url, { cache: 'no-store' });
    if (!response.ok) throw new Error(`下载失败：${response.status}`);

    const length = Number(response.headers.get('content-length') ?? '0');
    if (length > PACKAGE_MAX_BYTES) throw new Error('包超过 200MB');

    const bytes = new Uint8Array(await response.arrayBuffer());
    if (bytes.byteLength > PACKAGE_MAX_BYTES) throw new Error('包超过 200MB');

    await install(bytes, resolved.source);
  } catch (cause) {
    const message = messageOf(cause);
    setStatus(
      message.includes('Failed to fetch') || message.includes('NetworkError')
        ? '浏览器拦截了跨域下载。请先把 .hbx 下载到本地，再用「从文件导入」。'
        : message,
      'error',
    );
  } finally {
    busy = false;
    fetchButton.disabled = false;
  }
}

async function install(bytes: Uint8Array, source: string): Promise<void> {
  const store = await getStorage();
  setStatus('正在解压和校验…');
  const record: InstallRecord = await installFromZip(store, bytes, source);
  setStatus(`已安装：${record.name} ${record.version}。回到货架就能玩。`, 'success');
  urlInput.value = '';
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

async function resolveUrl(input: string): Promise<{ url: string; source: string }> {
  const url = new URL(input);

  if (url.hostname === 'github.com') {
    const parts = url.pathname.split('/').filter(Boolean);
    if (parts.length === 2) {
      const owner = parts[0];
      const repo = parts[1]?.replace(/\.git$/, '');
      if (!owner || !repo) throw new Error('GitHub 地址不完整');
      const api = `https://api.github.com/repos/${owner}/${repo}/releases/latest`;
      const response = await fetch(api, { headers: { Accept: 'application/vnd.github+json' } });
      if (!response.ok) {
        throw new Error(`GitHub 仓库读不到最新 Release：${response.status}`);
      }
      const release = (await response.json()) as {
        assets?: Array<{ name?: string; browser_download_url?: string }>;
      };
      const asset = release.assets?.find((item) => item.name?.endsWith('.hbx'));
      if (!asset?.browser_download_url) {
        throw new Error('这个仓库的最新 Release 没有 .hbx 资产');
      }
      return { url: asset.browser_download_url, source: `github:${owner}/${repo}` };
    }
  }

  if (!url.pathname.endsWith('.hbx')) {
    throw new Error('请给 .hbx 直接地址，或 GitHub 仓库地址');
  }
  return { url: url.toString(), source: url.toString() };
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
  if (!element) throw new Error(`import.html 缺少 ${selector}`);
  return element;
}
