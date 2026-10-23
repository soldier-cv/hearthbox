import {
  createAudio,
  createDisplay,
  createLoop,
  createSession,
  createWebBridge,
  getInstall,
  openStorage,
  parseDebugOptions,
  readInstalledFile,
  type Storage,
} from '@hearthbox/runtime';
import type { GameDefinition, GameManifest } from '@hearthbox/sdk';
import { mountOptionPanel } from './cheat-panel.js';
import { mountSystemMenu, type MenuAction } from './system-menu.js';

/**
 * 游戏宿主页。
 *
 * M1 只从演示游戏目录加载（dev server 直接提供 game.js）。M2 起改成从 IndexedDB
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
const installed = params.get('source') === 'installed';
// 开发期游戏的网关目录。已安装游戏从 IndexedDB 读，不使用 base。
const base = params.get('base') ?? '/demo';
const entryUrl = `${base}/game.js`;
const manifestUrl = `${base}/game.json`;

/** 已安装游戏的素材 blob URL，退出时统一撤销。 */
const assetUrls: string[] = [];

function revokeAssets(): void {
  for (const url of assetUrls) URL.revokeObjectURL(url);
  assetUrls.length = 0;
}

let session: ReturnType<typeof createSession> | null = null;
/** 金手指面板的挂载点。 */
const cheatHost = document.querySelector<HTMLElement>('#cheats');
/** 系统菜单的挂载点。 */
const menuHost = document.querySelector<HTMLElement>('#menu');

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

async function loadManifest(storage: Storage): Promise<GameManifest> {
  if (installed) {
    const record = await getInstall(storage, gameId);
    if (!record) throw new Error(`未安装：${gameId}`);
    return record.manifest;
  }
  const response = await fetch(manifestUrl);
  if (!response.ok) throw new Error(`读取 game.json 失败：${response.status}`);
  return (await response.json()) as GameManifest;
}

async function loadModule(storage: Storage): Promise<GameDefinition> {
  // 先取文本再建 blob URL：游戏代码绝不经过打包器。
  // 已安装游戏从 IndexedDB 读同一个 Blob，下面的 import 一字不改。
  //
  // SDK 必须被内联进 game.js（hbx pack 会校验没有裸导入）：
  // blob URL 下 `import '@hearthbox/sdk'` 解析不了，而 import maps 需要 Chromium 89+。
  let source: string;
  if (installed) {
    source = await (await readInstalledFile(storage, gameId, 'game.js')).text();
  } else {
    const response = await fetch(entryUrl);
    if (!response.ok) throw new Error(`读取入口失败：${response.status} ${entryUrl}`);
    source = await response.text();
  }

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
  const storage = await openStorage();
  const manifest = await loadManifest(storage);
  if (gameId && manifest.id !== gameId) {
    throw new Error(`清单 id 与请求不一致：${manifest.id} !== ${gameId}`);
  }

  const assetMap = new Map<string, string>();
  if (installed) {
    const record = await getInstall(storage, gameId);
    if (!record) throw new Error(`未安装：${gameId}`);
    for (const path of record.files) {
      if (!path.startsWith('assets/')) continue;
      const blob = await readInstalledFile(storage, gameId, path);
      const url = URL.createObjectURL(blob);
      assetUrls.push(url);
      assetMap.set(path.slice('assets/'.length), url);
    }
  }

  const resolveAsset = (path: string): string => {
    if (!installed) return `${base}/assets/${path}`;
    const url = assetMap.get(path);
    if (!url) throw new Error(`素材不存在：${path}`);
    return url;
  };

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

      const definition = await loadModule(storage);
      await instance.start({
        manifest,
        create: definition.create,
        resolveAsset,
        onExit: () => location.assign('/index.html'),
        onSystemMenu: () => openMenu(),
      });

      // 等 start() 完成再显示 HUD：此时游戏已 declare，菜单能列全。
      const hudBar = document.querySelector<HTMLElement>('#hud');
      if (hudBar) hudBar.hidden = false;
    },
  };
}

/**
 * 打开可调项面板。
 *
 * 三个 scope 共用一套实现，只是过滤条件与标题不同 —— 这是"一套 API
 * 覆盖三类面板"的直接体现。加新面板不需要写新的渲染代码。
 */
function openPanel(scope: 'cheat' | 'setting' | 'status'): void {
  if (!session || !cheatHost || cheatHost.hidden === false) return;
  if (session.optionsOf(scope).length === 0) return;

  const titles = { cheat: '金手指', setting: '游戏设置', status: '成就与统计' } as const;

  session.pause();
  const hudBar = document.querySelector<HTMLElement>('#hud');
  if (hudBar) hudBar.hidden = true;

  mountOptionPanel(cheatHost, session, scope, titles[scope], () => {
    if (hudBar) hudBar.hidden = false;
  });
}

/**
 * 打开系统菜单。
 *
 * 电视的主路径：长按 start+select（运行时保留输入）或遥控器返回键。
 * 鼠标点 HUD 的「菜单」也走这里，保证三条路是同一个菜单，不是三套逻辑。
 */
function openMenu(): void {
  if (!session || !menuHost || menuHost.hidden === false) return;
  if (cheatHost && cheatHost.hidden === false) return;

  session.pause();
  const hudBar = document.querySelector<HTMLElement>('#hud');
  if (hudBar) hudBar.hidden = true;

  const titles = { cheat: '金手指', setting: '游戏设置', status: '成就与统计' } as const;
  const actions: MenuAction[] = [
    {
      id: 'resume',
      label: '继续游戏',
      hint: '回到游戏',
      run() {
        if (hudBar) hudBar.hidden = false;
        session?.resume();
      },
    },
  ];

  for (const scope of ['cheat', 'setting', 'status'] as const) {
    const count = session.optionsOf(scope).length;
    if (count > 0) {
      actions.push({
        id: scope,
        label: titles[scope],
        hint: `${count} 项`,
        run: () => openPanel(scope),
      });
    }
  }

  actions.push({
    id: 'quit',
    label: '退出游戏',
    hint: '回到货架',
    run: () => location.assign('/index.html'),
  });

  mountSystemMenu(menuHost, actions, () => {
    if (hudBar) hudBar.hidden = false;
    session?.resume();
  });
}

const menuButton = document.querySelector<HTMLButtonElement>('#menu-btn');
menuButton?.addEventListener('click', openMenu);

/**
 * 第一次输入才启动游戏（音频要用户手势）。
 *
 * 关键：监听器在脚本求值时立刻注册，不等 boot() 的 await 完成。
 * 否则页面 load 后到 boot 就绪之间的按键会被丢弃 —— 表现为
 * "有时按一下没反应，要再按一次"，在慢设备和自动化里最容易复现。
 */
const ready = boot();
let started = false;

/**
 * 键盘与遥控器返回键（WebView 里通常就是 Escape）打开系统菜单。
 * 面板/菜单打开时它们自己处理返回，这里不能重复开。
 */
window.addEventListener('keydown', (event) => {
  if (event.code !== 'Escape' || !started) return;
  if (menuHost && menuHost.hidden === false) return;
  if (cheatHost && cheatHost.hidden === false) return;
  if (gate && gate.hidden === false) return;
  event.preventDefault();
  openMenu();
});

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
  // 先同步发起写入：等到 stop() 的异步落盘往往已经来不及。
  session?.flushNow();
  void session?.stop().catch(() => {});
  revokeAssets();
});

// pagehide 覆盖"切到后台被系统回收"的情况；beforeunload 在部分移动端不触发。
window.addEventListener('pagehide', () => {
  session?.flushNow();
  revokeAssets();
});
