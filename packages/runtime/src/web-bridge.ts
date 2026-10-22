import type { HostBridge } from './host.js';
import { createGamepadSource } from './input-gamepad.js';
import { createKeyboardSource } from './input-keyboard.js';
import { createPointerSource } from './input-pointer.js';
import type { InputSource } from './input-source.js';

export interface WebBridgeConfig {
  /** 手动指定输入源，端到端测试用来伪造手柄。 */
  sources?: InputSource[];
  /** 是否监听 visibilitychange。测试里关掉。 */
  lifecycle?: boolean;
  /** 指针事件目标，默认 window。 */
  pointerTarget?: EventTarget | null | undefined;
}

/**
 * 浏览器壳的输入源。
 *
 * 三类设备彼此独立、可同时工作：玩家可以一边推摇杆一边用鼠标点，
 * 也可以只用键盘方向键。运行时把三者汇总成同一个 InputView。
 */
export function defaultWebSources(config: WebBridgeConfig = {}): InputSource[] {
  return [
    createGamepadSource(),
    createKeyboardSource(),
    createPointerSource({ target: config.pointerTarget }),
  ];
}

/** 浏览器壳：Gamepad API + DOM 键盘 + Pointer Events + Screen Wake Lock。 */
export function createWebBridge(config: WebBridgeConfig = {}): HostBridge {
  const sources = config.sources ?? defaultWebSources(config);

  return {
    kind: 'web',
    inputSources: () => sources,
    keepAwake(on: boolean) {
      const wakeLock = (navigator as unknown as { wakeLock?: WakeLock }).wakeLock;
      if (!wakeLock) return;
      if (on) {
        // 拿不到锁（后台、不支持）就静默失败，见 runtime-api.md 第 2 节。
        void wakeLock.request('screen').catch(() => {});
      }
    },
    onLifecycle(cb) {
      if (config.lifecycle === false || typeof document === 'undefined') {
        return () => {};
      }
      const handler = (): void => {
        cb(document.visibilityState === 'hidden' ? 'pause' : 'resume');
      };
      document.addEventListener('visibilitychange', handler);
      return () => document.removeEventListener('visibilitychange', handler);
    },
  };
}

interface WakeLock {
  request(type: 'screen'): Promise<unknown>;
}
