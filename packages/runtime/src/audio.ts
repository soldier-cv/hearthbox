export type AudioBus = 'music' | 'sfx';

/** 与 game-sdk 的 AudioApi 对齐，但多一个平台自用的 resume。 */
export interface Audio {
  readonly ctx: AudioContext;
  readonly music: GainNode;
  readonly sfx: GainNode;
  /** 尝试恢复被挂起的上下文。浏览器可能拒绝，返回是否处于 running。 */
  resume(): Promise<boolean>;
  suspend(): Promise<void>;
  /** 设置总线增益，0..1。 */
  setVolume(bus: AudioBus, value: number): void;
  volume(bus: AudioBus): number;
  dispose(): void;
}

export interface AudioConfig {
  /** 注入构造器，测试或无 AudioContext 环境使用。 */
  createContext?: () => AudioContext;
}

/** 只有一个 AudioContext，两条总线，音量可持久化。 */
export function createAudio(config: AudioConfig = {}): Audio {
  const createContext =
    config.createContext ??
    (() => {
      const Ctor =
        globalThis.AudioContext ??
        (globalThis as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      return new Ctor();
    });

  const ctx = createContext();
  const music = ctx.createGain();
  const sfx = ctx.createGain();
  music.connect(ctx.destination);
  sfx.connect(ctx.destination);

  const volumes: Record<AudioBus, number> = { music: 1, sfx: 1 };

  return {
    ctx,
    music,
    sfx,
    async resume() {
      if (ctx.state === 'running') return true;
      try {
        await ctx.resume();
      } catch {
        return false;
      }
      return (ctx.state as AudioContextState) === 'running';
    },
    async suspend() {
      if (ctx.state === 'running') {
        try {
          await ctx.suspend();
        } catch {
          // 挂起失败不影响游戏继续运行。
        }
      }
    },
    setVolume(bus, value) {
      const clamped = value < 0 ? 0 : value > 1 ? 1 : value;
      volumes[bus] = clamped;
      const node = bus === 'music' ? music : sfx;
      node.gain.value = clamped;
    },
    volume(bus) {
      return volumes[bus];
    },
    dispose() {
      try {
        music.disconnect();
        sfx.disconnect();
      } catch {
        // 已断开时忽略。
      }
      void ctx.close().catch(() => {});
    },
  };
}
