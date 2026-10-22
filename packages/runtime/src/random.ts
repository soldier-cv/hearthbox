/**
 * 可设定种子的随机数。
 *
 * 为什么平台要提供：没有它就无法复现 bug。`ctx.debug.stepFrames` 能让你停在第
 * N 帧，但如果随机序列每次都不一样，停下来看到的仍是另一回事。
 *
 * 为什么不直接改 `Math.random`：那会污染同页面的其他代码（包括平台自身与第三方库），
 * 而且一旦改了就无法还原。所以只提供 `ctx.random`，由游戏自己决定用不用。
 *
 * 用 mulberry32：32 位状态，实现十几行，质量足够游戏用，且结果跨引擎一致
 * （`Math.random` 不保证跨引擎一致，这正是它的缺点）。
 */

export interface Random {
  /** [0, 1) 的浮点。 */
  next(): number;
  /** [min, max) 的整数。 */
  int(min: number, max: number): number;
  /** [min, max) 的浮点。 */
  float(min: number, max: number): number;
  /** 随机取一个元素。空数组返回 undefined。 */
  pick<T>(items: readonly T[]): T | undefined;
  /** 当前种子。复现时把它记下来即可重放同一串随机数。 */
  readonly seed: number;
}

/** mulberry32：小而够用，周期 2^32。 */
function mulberry32(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function createRandom(seed: number): Random {
  const normalize = (value: number): number => {
    // 允许负数与小数，统一下取整到 32 位无符号。
    const rounded = Math.floor(value);
    return rounded >>> 0;
  };

  const initial = normalize(seed);
  const step = mulberry32(initial);

  return {
    seed: initial,
    next: () => step(),
    int(min, max) {
      if (max <= min) return min;
      return Math.floor(step() * (max - min)) + min;
    },
    float: (min, max) => (max <= min ? min : step() * (max - min) + min),
    pick<T>(items: readonly T[]): T | undefined {
      if (items.length === 0) return undefined;
      return items[Math.floor(step() * items.length)];
    },
  };
}

/**
 * 没有指定种子时用它。
 *
 * 用时间戳而不是 `Math.random()`：调试时看到 `seed=1730...` 至少能知道
 * 那一次运行的起点，而纯随机的种子连记都记不住。
 */
export function randomSeed(): number {
  return Date.now() >>> 0;
}

/** 测试与调试用：重放同一串随机数。 */
export function replay(seed: number, count: number): number[] {
  const random = createRandom(seed);
  const out: number[] = [];
  for (let i = 0; i < count; i += 1) out.push(random.next());
  return out;
}
