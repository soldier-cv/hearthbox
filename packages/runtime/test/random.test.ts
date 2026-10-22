import { describe, expect, it } from 'vitest';
import { createRandom, replay, randomSeed } from '../src/random.js';

describe('createRandom', () => {
  it('同一 seed 产生同一串数（复现的前提）', () => {
    const a = replay(12345, 20);
    const b = replay(12345, 20);
    expect(a).toEqual(b);
  });

  it('不同 seed 产生不同序列', () => {
    expect(replay(1, 10)).not.toEqual(replay(2, 10));
  });

  it('next 落在 [0, 1)', () => {
    const random = createRandom(99);
    for (let i = 0; i < 200; i += 1) {
      const value = random.next();
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThan(1);
    }
  });

  it('int 落在 [min, max)', () => {
    const random = createRandom(7);
    for (let i = 0; i < 200; i += 1) {
      const value = random.int(3, 8);
      expect(value).toBeGreaterThanOrEqual(3);
      expect(value).toBeLessThan(8);
      expect(Number.isInteger(value)).toBe(true);
    }
  });

  it('int 的边界情况不崩', () => {
    const random = createRandom(1);
    expect(random.int(5, 5)).toBe(5);
    expect(random.int(5, 3)).toBe(5);
  });

  it('float 落在 [min, max)', () => {
    const random = createRandom(3);
    for (let i = 0; i < 100; i += 1) {
      const value = random.float(-1, 1);
      expect(value).toBeGreaterThanOrEqual(-1);
      expect(value).toBeLessThan(1);
    }
  });

  it('pick 返回数组内的元素', () => {
    const random = createRandom(42);
    const items = ['a', 'b', 'c'];
    for (let i = 0; i < 50; i += 1) {
      expect(items).toContain(random.pick(items));
    }
  });

  it('pick 空数组返回 undefined', () => {
    const random = createRandom(1);
    expect(random.pick([])).toBeUndefined();
  });

  it('seed 可读回，并且归一化成 32 位无符号', () => {
    expect(createRandom(42).seed).toBe(42);
    expect(createRandom(-1).seed).toBe(4294967295);
    // 归一化之后仍然是同一串
    expect(replay(-1, 5)).toEqual(replay(4294967295, 5));
  });

  it('randomSeed 返回合法整数', () => {
    const seed = randomSeed();
    expect(Number.isInteger(seed)).toBe(true);
    expect(seed).toBeGreaterThanOrEqual(0);
    expect(seed).toBeLessThan(4294967296);
  });
});
