/**
 * 调试口子。
 *
 * 目的不是"给开发者一堆工具"，而是让几件**只有平台能做**的事变成可能：
 * 复现一个 bug、验证确定性、在不改游戏代码的前提下观察状态。
 *
 * 全部默认关闭。游戏读到 `ctx.debug.enabled === false` 时不进入任何
 * 额外分支，也不需要为它写代码。
 */
export interface DebugApi {
  /** 是否处于调试模式。由宿主通过 URL 参数或设置项打开。 */
  readonly enabled: boolean;
  /**
   * 固定随机种子。为 `null` 时游戏用 `Math.random`。
   *
   * 平台不改 `Math.random`（那会污染同页面的其他代码），只是把这个值
   * 传给游戏，由游戏自己决定要不要用可复现的 PRNG。
   */
  readonly seed: number | null;
  /**
   * 时间缩放。`update(dt)` 的 `dt` 会乘以它。
   *
   * 用于慢放观察物理问题。范围 0.05–4，超出被夹取。
   */
  readonly timeScale: number;
  /** 注册一帧步进回调；仅在调试模式下有意义，见 `stepFrames`。 */
  onFrame(callback: (frame: number) => void): () => void;
  /**
   * 暂停主循环并手动推进 N 帧。
   *
   * 非调试模式下是空操作 —— 游戏可以无条件调用，不必分支。
   */
  stepFrames(count: number): void;
  /** 是否处于"手动步进"的暂停状态。 */
  readonly paused: boolean;
  /** 恢复自动推进。 */
  resume(): void;
}

/** 调试设置的来源，由宿主解析后传入。 */
export interface DebugOptions {
  enabled?: boolean;
  seed?: number | null;
  timeScale?: number;
}

/** 从 URL 查询串解析调试参数：`?debug=1&seed=42&speed=0.5`。 */
export function parseDebugOptions(search: string): DebugOptions {
  const params = new URLSearchParams(search);
  const debug = params.get('debug');
  const seedRaw = params.get('seed');
  const speedRaw = params.get('speed');

  const options: DebugOptions = {};
  if (debug === '1' || debug === 'true') options.enabled = true;
  if (seedRaw !== null) {
    const seed = Number(seedRaw);
    if (Number.isFinite(seed)) options.seed = seed;
  }
  if (speedRaw !== null) {
    const speed = Number(speedRaw);
    if (Number.isFinite(speed)) options.timeScale = clampTimeScale(speed);
  }
  return options;
}

export function clampTimeScale(value: number): number {
  if (!Number.isFinite(value)) return 1;
  return Math.min(4, Math.max(0.05, value));
}
