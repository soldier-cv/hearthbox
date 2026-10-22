import type { Button, PadState } from '@hearthbox/sdk';
import { hasBit } from './input-source.js';

/**
 * 运行时内部使用的可变 PadState。
 * 每个玩家槽位一份，跨帧复用；游戏拿到的只读视图就是它。
 */
export interface MutablePadState extends PadState {
  connected: boolean;
  lx: number;
  ly: number;
  rx: number;
  ry: number;
  lt: number;
  rt: number;
  move: { x: number; y: number };
  /** 本帧持有 / 刚按下 / 刚松开的位掩码。 */
  heldMask: number;
  pressedMask: number;
  releasedMask: number;
}

class PadStateImpl implements MutablePadState {
  connected = false;
  lx = 0;
  ly = 0;
  rx = 0;
  ry = 0;
  lt = 0;
  rt = 0;
  move = { x: 0, y: 0 };
  heldMask = 0;
  pressedMask = 0;
  releasedMask = 0;

  held(button: Button): boolean {
    return hasBit(this.heldMask, button);
  }

  pressed(button: Button): boolean {
    return hasBit(this.pressedMask, button);
  }

  released(button: Button): boolean {
    return hasBit(this.releasedMask, button);
  }
}

export function createPadState(): MutablePadState {
  return new PadStateImpl();
}
