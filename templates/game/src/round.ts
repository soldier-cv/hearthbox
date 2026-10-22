/**
 * 一个极简的状态机。
 *
 * 为什么需要它：新手游戏最常见的 bug 是"状态乱了"——死了还能动、
 * 赢了还能吃道具、暂停时倒计时还在跑。用一个显式状态机挡掉这类问题。
 *
 * 不需要更复杂的东西（不用事件系统、不用 ECS）。小游戏就三个状态。
 */
export type Phase = 'playing' | 'won' | 'lost';

export class Round {
  phase: Phase = 'playing';
  /** 已过时间，秒。 */
  elapsed = 0;
  /** 已收集数量。 */
  collected = 0;

  constructor(
    private readonly duration: number,
    private readonly target: number,
  ) {}

  /** 每帧调用一次。返回本帧是否发生了状态切换。 */
  update(dt: number): boolean {
    if (this.phase !== 'playing') return false;

    this.elapsed += dt;
    if (this.elapsed >= this.duration) {
      this.phase = 'lost';
      return true;
    }
    return false;
  }

  /** 收集一个。返回是否因此获胜。 */
  collect(): boolean {
    if (this.phase !== 'playing') return false;

    this.collected += 1;
    if (this.collected >= this.target) {
      this.phase = 'won';
      return true;
    }
    return false;
  }

  get remaining(): number {
    return Math.ceil(this.duration - this.elapsed);
  }

  get isPlaying(): boolean {
    return this.phase === 'playing';
  }

  reset(): void {
    this.phase = 'playing';
    this.elapsed = 0;
    this.collected = 0;
  }
}
