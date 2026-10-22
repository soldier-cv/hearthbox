/**
 * 死区与轴处理。
 *
 * 径向死区：先减去死区再除以 1-deadzone，使输出从 0 开始连续，不会在阈值处跳变。
 * 超过 outerDeadzone 饱和到 1。这些函数每帧调用，不得分配。
 */

/** 归一化到长度 ≤ 1。 */
function capLength(out: { x: number; y: number }): void {
  const length = Math.sqrt(out.x * out.x + out.y * out.y);
  if (length > 1) {
    out.x /= length;
    out.y /= length;
  }
}

/** 把 (x, y) 就地写入 out，避免每帧创建对象。 */
export function applyRadialDeadzone(
  x: number,
  y: number,
  deadzone: number,
  outerDeadzone: number,
  out: { x: number; y: number },
): void {
  const length = Math.sqrt(x * x + y * y);
  if (length < deadzone || length === 0) {
    out.x = 0;
    out.y = 0;
    return;
  }

  // 死区外线性重映射到 0..1；外圈之后恒为 1。
  const span = outerDeadzone - deadzone;
  const scaled = span <= 0 ? 1 : Math.min(1, (length - deadzone) / span);
  const factor = scaled / length;

  out.x = x * factor;
  out.y = y * factor;
  capLength(out);
}

/** 扳机死区：低于阈值归零，之后线性重映射到 0..1。 */
export function applyTriggerDeadzone(value: number, deadzone: number): number {
  if (value <= deadzone) return 0;
  const scaled = (value - deadzone) / (1 - deadzone);
  return scaled > 1 ? 1 : scaled;
}

/** 单轴吸附（用于 D-pad 以轴形式上报的情况）。 */
export function snapAxis(value: number, threshold = 0.5): number {
  if (value > threshold) return 1;
  if (value < -threshold) return -1;
  return 0;
}

/**
 * D-pad 与左摇杆合并：D-pad 视为长度 1 的向量，两者取长度较大者。
 * 结果写入 out，长度 ≤ 1。
 */
export function mergeMove(
  lx: number,
  ly: number,
  hatX: number,
  hatY: number,
  out: { x: number; y: number },
): void {
  const stickLength = Math.sqrt(lx * lx + ly * ly);
  const hatLength = Math.sqrt(hatX * hatX + hatY * hatY);

  if (hatLength === 0 || stickLength >= 1) {
    out.x = lx;
    out.y = ly;
    capLength(out);
    return;
  }

  // D-pad 的单位向量。
  out.x = hatX / hatLength;
  out.y = hatY / hatLength;

  // 摇杆比 D-pad 长时用摇杆的原始方向与长度。
  if (stickLength > 1) return;
  if (stickLength > hatLength) {
    out.x = lx;
    out.y = ly;
    capLength(out);
  }
}
