import type { HostBridge } from './host.js';
import { createGamepadSource } from './input-gamepad.js';
import { createKeyboardSource } from './input-keyboard.js';

export interface WebBridgeConfig {
  /** 手动指定输入源，端到端测试用来伪造手柄。 */
  sources?: HostBridge['inputSources'] extends () => Array<infer T> ? T[] : never;
  /** 是否监听 visibilitychange。测试里关掉。 */
  lifecycle?: boolean;
}

/** 浏览器壳：Gamepad API + DOM 键盘 + Screen Wake Lock + visibilitychange。 */
export function createWebBridge(config: WebBridgeConfig = {}): HostBridge {
  const sources = config.sources ?? [createGamepadSource(), createKeyboardSource()];

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
