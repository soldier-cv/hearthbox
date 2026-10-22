import { bitOf, type InputSource, type RawInputTarget, type RawPadState } from './input-source.js';

/** 标准 Gamepad 映射的按钮索引（mapping === 'standard'）。 */
const STANDARD_BUTTONS: Array<[button: string, index: number]> = [
  ['south', 0],
  ['east', 1],
  ['west', 2],
  ['north', 3],
  ['l1', 4],
  ['r1', 5],
  ['l2', 6],
  ['r2', 7],
  ['select', 8],
  ['start', 9],
  ['l3', 10],
  ['r3', 11],
  ['up', 12],
  ['down', 13],
  ['left', 14],
  ['right', 15],
];

export interface GamepadSourceConfig {
  /** 返回当前 gamepad 列表，测试可注入。 */
  getGamepads?: () => ArrayLike<Gamepad | null>;
  /** 分配到的玩家槽位，0..3。 */
  slot?: number;
}

/**
 * Windows / PC 的手柄输入源。
 *
 * 只在安全上下文可用（见 decisions.md D3）；拿不到手柄时不报错，connected=false。
 */
export function createGamepadSource(config: GamepadSourceConfig = {}): InputSource {
  const getGamepads =
    config.getGamepads ??
    (() =>
      typeof navigator !== 'undefined' && navigator.getGamepads ? navigator.getGamepads() : []);
  const slot = config.slot ?? 0;

  let running = false;
  let previousButtons = 0;

  return {
    id: 'gamepad',
    start() {
      running = true;
      previousButtons = 0;
    },
    stop() {
      running = false;
    },
    drain(target: RawInputTarget) {
      const raw = target.pad;
      const pad = running ? findPad(getGamepads()) : null;

      if (!pad) {
        raw.connected = false;
        previousButtons = 0;
        return;
      }

      const mask = buttonsOf(pad);
      writePad(raw, pad, slot, mask);
      // 本帧出现过的按下：含"上帧按住、本帧松开"的抖动路径。
      raw.touches = mask | previousButtons;
      previousButtons = mask;
    },
  };
}

/** 取第一个已连接的手柄。没有时返回 null。 */
function findPad(pads: ArrayLike<Gamepad | null>): Gamepad | null {
  for (let i = 0; i < pads.length; i += 1) {
    const candidate = pads[i];
    if (candidate && candidate.connected) return candidate;
  }
  return null;
}

function writePad(raw: RawPadState, pad: Gamepad, slot: number, mask: number): void {
  raw.connected = true;
  raw.slot = slot;
  raw.deviceKey = `${pad.id}|${pad.mapping ?? ''}`;
  raw.lx = pad.axes[0] ?? 0;
  raw.ly = pad.axes[1] ?? 0;
  raw.rx = pad.axes[2] ?? 0;
  raw.ry = pad.axes[3] ?? 0;
  raw.lt = pad.buttons[6]?.value ?? 0;
  raw.rt = pad.buttons[7]?.value ?? 0;
  raw.buttons = mask;
  raw.hatX = axisOf(mask, 'left', 'right');
  raw.hatY = axisOf(mask, 'up', 'down');
}

function buttonsOf(pad: Gamepad): number {
  let mask = 0;
  for (const [button, index] of STANDARD_BUTTONS) {
    const state = pad.buttons[index];
    if (!state || (!state.pressed && state.value <= 0.5)) continue;
    const bit = bitOf(button as never);
    if (bit >= 0) mask |= 1 << bit;
  }
  return mask;
}

function axisOf(mask: number, negative: 'left' | 'up', positive: 'right' | 'down'): number {
  const neg = bitOf(negative);
  const pos = bitOf(positive);
  return ((mask & (1 << pos)) !== 0 ? 1 : 0) - ((mask & (1 << neg)) !== 0 ? 1 : 0);
}
