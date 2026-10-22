import type { DebugApi } from '@hearthbox/sdk';
import { clampTimeScale } from './debug.js';

export interface DebugSettings {
  enabled?: boolean;
  seed?: number | null;
  timeScale?: number;
}

export interface DebugController {
  readonly api: DebugApi;
  /**
   * 本帧是否应该跑 update。
   *
   * 手动步进模式下只有还有待推步数时为真。正常模式恒为真。
   */
  shouldStep(): boolean;
  /** 每帧推进一次计数并触发回调。 */
  tick(): void;
  /** 当前生效的 dt 倍率。 */
  readonly timeScale: number;
}

/**
 * 调试口子：默认全关。
 *
 * 关闭时所有方法都是空操作，游戏可以无条件调用，不必在游戏里写 if (debug)。
 */
export function createDebug(settings: DebugSettings = {}): DebugController {
  const enabled = settings.enabled === true;
  const timeScale = clampTimeScale(settings.timeScale ?? 1);
  const callbacks = new Set<(frame: number) => void>();

  let frame = 0;
  let paused = false;
  let pending = 0;

  const api: DebugApi = {
    enabled,
    seed: settings.seed ?? null,
    timeScale,
    onFrame(callback) {
      if (!enabled) return () => {};
      callbacks.add(callback);
      return () => {
        callbacks.delete(callback);
      };
    },
    stepFrames(count) {
      if (!enabled) return;
      paused = true;
      pending += Math.max(0, Math.floor(count));
    },
    get paused() {
      return paused;
    },
    resume() {
      paused = false;
      pending = 0;
    },
  };

  return {
    api,
    timeScale,
    shouldStep() {
      if (!paused) return true;
      if (pending <= 0) return false;
      pending -= 1;
      return true;
    },
    tick() {
      frame += 1;
      for (const callback of callbacks) callback(frame);
    },
  };
}
