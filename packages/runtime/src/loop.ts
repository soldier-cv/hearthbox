/**
 * 主循环：固定 60Hz 更新 + 插值渲染。
 *
 * 累加真实经过时间，单帧最多补 5 次 update，超出的时间直接丢弃。
 * 这样一次卡顿不会引发"补帧 → 更卡"的死亡螺旋。
 */

export const FIXED_STEP = 1 / 60;
const MAX_FRAME_TIME = 0.25;
const MAX_STEPS_PER_FRAME = 5;

export interface LoopHandlers {
  /** dt 恒为 1/60。 */
  update(dt: number): void;
  /** alpha ∈ [0, 1)，距下一个 update 的插值系数。 */
  render(alpha: number): void;
}

export interface Loop {
  start(): void;
  stop(): void;
  /** 为 true 时跳过 update，仍调用 render。 */
  paused: boolean;
}

export interface LoopDeps {
  /** 注入 rAF / 时间源，测试时手动推进。 */
  requestFrame?: ((cb: (time: number) => void) => number) | undefined;
  cancelFrame?: ((handle: number) => void) | undefined;
  onError?: ((error: unknown) => void) | undefined;
}

export function createLoop(handlers: LoopHandlers, deps: LoopDeps = {}): Loop {
  const requestFrame =
    deps.requestFrame ?? ((cb) => requestAnimationFrame(cb as FrameRequestCallback));
  const cancelFrame = deps.cancelFrame ?? ((handle) => cancelAnimationFrame(handle));
  const onError = deps.onError ?? (() => {});

  let running = false;
  let handle = 0;
  let last = 0;
  let accumulator = 0;

  const loop: Loop = {
    paused: false,
    start() {
      if (running) return;
      running = true;
      accumulator = 0;
      // 第一帧没有"上一次时间"，用 0 让第一次 tick 只建立基准。
      last = -1;
      handle = requestFrame(tick);
    },
    stop() {
      if (!running) return;
      running = false;
      if (handle !== 0) cancelFrame(handle);
      handle = 0;
    },
  };

  function tick(time: number): void {
    if (!running) return;
    try {
      if (last < 0) {
        last = time;
      } else {
        let frameTime = (time - last) / 1000;
        last = time;
        if (frameTime > MAX_FRAME_TIME) frameTime = MAX_FRAME_TIME;
        accumulator += frameTime;

        if (!loop.paused) {
          let steps = 0;
          while (accumulator >= FIXED_STEP && steps < MAX_STEPS_PER_FRAME) {
            handlers.update(FIXED_STEP);
            accumulator -= FIXED_STEP;
            steps += 1;
          }
          // 超出上限的时间丢弃，不留给下一帧继续追。
          if (accumulator > FIXED_STEP * MAX_STEPS_PER_FRAME) accumulator = 0;
        }
      }

      handlers.render(loop.paused ? 0 : accumulator / FIXED_STEP);
    } catch (error) {
      running = false;
      handle = 0;
      onError(error);
      return;
    }

    if (running) handle = requestFrame(tick);
  }

  return loop;
}
