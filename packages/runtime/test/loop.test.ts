import { describe, expect, it } from 'vitest';
import { createLoop, FIXED_STEP } from '../src/loop.js';

interface Frame {
  cb: ((time: number) => void) | null;
}

function makeClock() {
  const frame: Frame = { cb: null };
  let time = 0;
  return {
    frame,
    requestFrame(cb: (time: number) => void): number {
      frame.cb = cb;
      return 1;
    },
    cancelFrame(): void {
      frame.cb = null;
    },
    /** 推进到指定时刻并执行当前排队的回调。 */
    advance(ms: number): void {
      time += ms;
      const cb = frame.cb;
      frame.cb = null;
      cb?.(time);
    },
  };
}

describe('createLoop', () => {
  it('按 60Hz 固定步长更新', () => {
    const clock = makeClock();
    let updates = 0;
    const handlers = { update: () => (updates += 1), render: () => {} };
    const loop = createLoop(handlers, {
      requestFrame: clock.requestFrame,
      cancelFrame: clock.cancelFrame,
    });

    loop.start();
    clock.advance(0); // 建立基准
    clock.advance(1000 / 60);
    expect(updates).toBe(1);
    clock.advance(1000 / 60);
    expect(updates).toBe(2);
    loop.stop();
  });

  it('单帧最多补 5 步，超出的时间丢弃', () => {
    const clock = makeClock();
    let updates = 0;
    const loop = createLoop(
      { update: () => (updates += 1), render: () => {} },
      { requestFrame: clock.requestFrame, cancelFrame: clock.cancelFrame },
    );

    loop.start();
    clock.advance(0);
    // 一整个 200ms 的卡顿
    clock.advance(200);
    expect(updates).toBe(5);

    // 下一帧只有正常的一步，说明没有遗留的追赶债务
    updates = 0;
    clock.advance(1000 / 60 + 1);
    expect(updates).toBe(1);
    loop.stop();
  });

  it('长于 250ms 的帧被截断', () => {
    const clock = makeClock();
    let updates = 0;
    const loop = createLoop(
      { update: () => (updates += 1), render: () => {} },
      { requestFrame: clock.requestFrame, cancelFrame: clock.cancelFrame },
    );
    loop.start();
    clock.advance(0);
    clock.advance(5000);
    // 250ms 也只够 5 步，且上限就是 5
    expect(updates).toBe(5);
    loop.stop();
  });

  it('paused 时跳过 update 但仍 render', () => {
    const clock = makeClock();
    let updates = 0;
    let renders = 0;
    const loop = createLoop(
      { update: () => (updates += 1), render: () => (renders += 1) },
      { requestFrame: clock.requestFrame, cancelFrame: clock.cancelFrame },
    );
    loop.paused = true;
    loop.start();
    clock.advance(0);
    clock.advance(1000 / 60);
    expect(updates).toBe(0);
    expect(renders).toBe(2);
    loop.stop();
  });

  it('render 的 alpha 在 0 到 1 之间', () => {
    const clock = makeClock();
    const alphas: number[] = [];
    const loop = createLoop(
      { update: () => {}, render: (alpha) => alphas.push(alpha) },
      { requestFrame: clock.requestFrame, cancelFrame: clock.cancelFrame },
    );
    loop.start();
    clock.advance(0);
    clock.advance(FIXED_STEP * 500); // 半帧
    for (const alpha of alphas) {
      expect(alpha).toBeGreaterThanOrEqual(0);
      expect(alpha).toBeLessThan(1);
    }
    loop.stop();
  });

  it('update 抛错时停止并把错误交给 onError', () => {
    const clock = makeClock();
    const errors: unknown[] = [];
    const loop = createLoop(
      {
        update: () => {
          throw new Error('boom');
        },
        render: () => {},
      },
      {
        requestFrame: clock.requestFrame,
        cancelFrame: clock.cancelFrame,
        onError: (error) => errors.push(error),
      },
    );
    loop.start();
    clock.advance(0);
    clock.advance(1000 / 60);
    expect(errors).toHaveLength(1);

    // 已经停了，再推进也不会继续执行
    clock.advance(1000 / 60);
    expect(errors).toHaveLength(1);
  });

  it('重复 start / stop 是幂等的', () => {
    const clock = makeClock();
    let updates = 0;
    const loop = createLoop(
      { update: () => (updates += 1), render: () => {} },
      { requestFrame: clock.requestFrame, cancelFrame: clock.cancelFrame },
    );
    loop.start();
    loop.start();
    clock.advance(0);
    clock.advance(1000 / 60);
    expect(updates).toBe(1);
    loop.stop();
    loop.stop();
  });
});
