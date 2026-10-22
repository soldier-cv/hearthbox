import { describe, expect, it } from 'vitest';
import { applyRadialDeadzone, applyTriggerDeadzone, mergeMove, snapAxis } from '../src/deadzone.js';

function vec(): { x: number; y: number } {
  return { x: 0, y: 0 };
}

describe('applyRadialDeadzone', () => {
  it('死区内归零', () => {
    const out = vec();
    applyRadialDeadzone(0.1, 0.1, 0.15, 0.95, out);
    expect(out.x).toBe(0);
    expect(out.y).toBe(0);
  });

  it('刚过死区时输出从 0 连续增长', () => {
    const out = vec();
    applyRadialDeadzone(0.1501, 0, 0.15, 0.95, out);
    expect(out.x).toBeGreaterThan(0);
    expect(out.x).toBeLessThan(0.01);
  });

  it('外圈之后饱和到长度 1', () => {
    const out = vec();
    applyRadialDeadzone(0.99, 0, 0.15, 0.95, out);
    expect(Math.hypot(out.x, out.y)).toBeCloseTo(1, 5);
  });

  it('方向不变', () => {
    const out = vec();
    applyRadialDeadzone(0.5, 0.5, 0.15, 0.95, out);
    expect(out.x).toBeCloseTo(out.y, 6);
  });
});

describe('applyTriggerDeadzone', () => {
  it('低于阈值归零', () => {
    expect(applyTriggerDeadzone(0.04, 0.05)).toBe(0);
  });

  it('超过阈值线性重映射', () => {
    expect(applyTriggerDeadzone(0.525, 0.05)).toBeCloseTo(0.5, 5);
  });

  it('不会超过 1', () => {
    expect(applyTriggerDeadzone(2, 0.05)).toBe(1);
  });
});

describe('snapAxis', () => {
  it('吸附到 ±1 或 0', () => {
    expect(snapAxis(0.9)).toBe(1);
    expect(snapAxis(-0.9)).toBe(-1);
    expect(snapAxis(0.2)).toBe(0);
  });
});

describe('mergeMove', () => {
  it('摇杆比 D-pad 长时用摇杆', () => {
    const out = vec();
    mergeMove(1, 0, 0.8, 0, out);
    expect(out.x).toBeCloseTo(1, 5);
    expect(out.y).toBe(0);
  });

  it('D-pad 按下时至少是单位长度', () => {
    const out = vec();
    mergeMove(0.1, 0, 1, 0, out);
    expect(out.x).toBeCloseTo(1, 5);
  });

  it('斜向 D-pad 归一化后长度仍为 1', () => {
    const out = vec();
    mergeMove(0, 0, 1, 1, out);
    expect(Math.hypot(out.x, out.y)).toBeCloseTo(1, 5);
  });

  it('两者都空时为 0', () => {
    const out = { x: 9, y: 9 };
    mergeMove(0, 0, 0, 0, out);
    expect(out.x).toBe(0);
    expect(out.y).toBe(0);
  });
});
