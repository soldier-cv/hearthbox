import {
  createAudio,
  createDisplay,
  createLoop,
  createSession,
  createWebBridge,
  openStorage,
  parseDebugOptions,
} from '@hearthbox/runtime';
import type { GameDefinition, GameManifest } from '@hearthbox/sdk';

/**
 * 游戏宿主页。
 *
 * M1 只从夹具目录加载（dev server 直接提供 game.js）。M2 起改成从 IndexedDB
 * 读出 .hbx 的文件表、建 blob URL、再 import —— 这里的分界点是 resolveAsset
 * 与 loadModule 两个函数，它们已经按"文件从哪里来"抽象好了。
 */

const SDK_VERSION = '0.1.0';
const stage = document.querySelector<HTMLElement>('#stage');
const crash = document.querySelector<HTMLElement>('#crash');
const crashMessage = document.querySelector<HTMLElement>('#crash-message');
const gate = document.querySelector<HTMLElement>('#gate');
const backButton = document.querySelector<HTMLButtonElement>('#back');

if (!stage || !crash || !crashMessage || !gate || !backButton) {
  throw new Error('play.html 缺少必要的节点');
}

const params = new URLSearchParams(location.search);
const gameId = params.get('id') ?? '';
const base = params.get('base') ?? '/fixtures/contract';
const entryPath = params.get('entry') ?? 'game.js';
const manifestPath = params.get('manifest') ?? 'game.json';
const entryUrl = `${base}/${entryPath}`;
const manifestUrl = `${base}/${manifestPath}`;

let session: ReturnType<typeof createSession> | null = null;

function showCrash(error: unknown): void {
  const message = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
  crashMessage!.textContent = message;
  crash!.hidden = false;
  // 崩溃页在最上层；"按任意键开始"的遮罩必须收起，否则它的 z 序会盖住按钮。
  gate!.hidden = true;
  // 崩溃时释放循环与存储连接，崩溃页本身不需要运行时。
  void session?.stop().catch(() => {});
}

backButton.addEventListener('click', () => {
  location.assign('/index.html');
});

window.addEventListener('error', (event) => showCrash(event.error ?? event.message));
window.addEventListener('unhandledrejection', (event) => showCrash(event.reason));

async function loadManifest(): Promise<GameManifest> {
  const response = await fetch(manifestUrl);
  if (!response.ok) throw new Error(`读取 game.json 失败：${response.status}`);
  return (await response.json()) as GameManifest;
}

async function loadModule(): Promise<GameDefinition> {
  // 先取文本再建 blob URL：游戏代码绝不经过打包器。
  // M2 起把 fetch 换成从 IndexedDB 读 Blob，下面的 import 一字不改。
  //
  // SDK 必须被内联进 game.js（hbx pack 会校验没有裸导入）：
  // blob URL 下 `import '@hearthbox/sdk'` 解析不了，而 import maps 需要 Chromium 89+。
  const response = await fetch(entryUrl);
  if (!response.ok) throw new Error(`读取入口失败：${response.status} ${entryUrl}`);
  const source = await response.text();

  const blobUrl = URL.createObjectURL(new Blob([source], { type: 'text/javascript' }));
  try {
    const module = (await import(/* @vite-ignore */ blobUrl)) as { default?: GameDefinition };
    const definition = module.default;
    if (!definition || typeof definition.create !== 'function') {
      throw new Error('game.js 的默认导出不是 defineGame() 的返回值');
    }
    return definition;
  } finally {
    // 模块已经执行完，URL 可以撤销；不撤销会泄漏到游戏退出。
    URL.revokeObjectURL(blobUrl);
  }
}

interface Booted {
  manifest: GameManifest;
  audio: ReturnType<typeof createAudio>;
  display: ReturnType<typeof createDisplay>;
  startGame(): Promise<void>;
}

async function boot(): Promise<Booted> {
  const manifest = await loadManifest();
  if (gameId && manifest.id !== gameId) {
    throw new Error(`清单 id 与请求不一致：${manifest.id} !== ${gameId}`);
  }

  const storage = await openStorage();
  const display = createDisplay({
    width: manifest.display.width,
    height: manifest.display.height,
    scale: manifest.display.scale,
    pixelArt: manifest.display.pixelArt,
  });
  const audio = createAudio();
  const bridge = createWebBridge();

  const instance = createSession({
    bridge,
    display,
    audio,
    storage,
    sdkVersion: SDK_VERSION,
    gameId: manifest.id,
    // 调试参数从 URL 来：?debug=1&seed=42&speed=0.5
    debug: parseDebugOptions(location.search),
  });
  session = instance;

  return {
    manifest,
    audio,
    display,
    async startGame() {
      // 浏览器要求用户手势才能解锁音频；解锁失败就停在"按任意键开始"。
      const unlocked = await audio.resume();
      if (!unlocked) {
        gate!.hidden = false;
        return;
      }

      gate!.hidden = true;
      display.attach(stage!);

      const definition = await loadModule();
      await instance.start({
        manifest,
        create: definition.create,
        resolveAsset: (path) => `${base}/assets/${path}`,
        onExit: () => location.assign('/index.html'),
        onSystemMenu: () => {
          if (confirm('退出游戏？')) location.assign('/index.html');
          else instance.resume();
        },
      });
    },
  };
}

/**
 * 第一次输入才启动游戏（音频要用户手势）。
 *
 * 关键：监听器在脚本求值时立刻注册，不等 boot() 的 await 完成。
 * 否则页面 load 后到 boot 就绪之间的按键会被丢弃 —— 表现为
 * "有时按一下没反应，要再按一次"，在慢设备和自动化里最容易复现。
 */
const ready = boot();
let started = false;

function begin(): void {
  if (started) return;
  started = true;
  window.removeEventListener('keydown', onKeyDown);
  window.removeEventListener('pointerdown', onPointerDown);
  void ready.then((booted) => booted.startGame()).catch(showCrash);
}

function onKeyDown(event: Event): void {
  const keyboard = event as KeyboardEvent;
  if (keyboard.code === 'Enter' || keyboard.code.startsWith('Arrow')) {
    keyboard.preventDefault?.();
  }
  begin();
}

function onPointerDown(): void {
  begin();
}

window.addEventListener('keydown', onKeyDown);
window.addEventListener('pointerdown', onPointerDown);

// 手柄按键不会产生 DOM 事件；用一个轻量轮询作为补充解锁路径。
const unlockPoll = createLoop({
  update() {
    if (started) return;
    const pads = navigator.getGamepads ? navigator.getGamepads() : [];
    for (const pad of pads) {
      if (pad?.connected && Array.from(pad.buttons).some((button) => button.pressed)) {
        unlockPoll.stop();
        begin();
        return;
      }
    }
  },
  render() {},
});
unlockPoll.start();

void ready.catch(showCrash);

window.addEventListener('beforeunload', () => {
  unlockPoll.stop();
  void session?.stop().catch(() => {});
});
