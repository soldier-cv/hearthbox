import type { PadState } from '@hearthbox/sdk';

/**
 * 一套只用方向键 / 摇杆 / A / B 的列表导航。
 *
 * 货架、系统菜单、可调项面板共用它。DOM 焦点仍存在（鼠标和读屏要用），
 * 但电视上的"当前项"由 data-active 表示，不依赖 Tab。
 */

export type NavKey = 'up' | 'down' | 'left' | 'right' | 'accept' | 'back';

/** 摇杆过这个值才算拨了一下。回中附近的噪声不应移动选择。 */
const TILT = 0.55;

export interface NavStep {
  /** 本帧识别出的动作，没有就是 null。 */
  key: NavKey | null;
  /** 是否有输入设备连接。 */
  connected: boolean;
}

export interface NavTracker {
  step(pad: PadState): NavStep;
  reset(): void;
}

/**
 * 轴取边沿：按住摇杆只走一格，松开回中后才能再走。
 * 手柄十字键与键盘方向键在运行时里已经合并到 `move`，这里只读一处。
 */
export function createNavTracker(): NavTracker {
  const tilt = { x: 0, y: 0 };

  function step(pad: PadState): NavStep {
    const sx = snap(pad.move.x);
    const sy = snap(pad.move.y);
    let key: NavKey | null = null;

    if (pad.pressed('south') || pad.pressed('start')) key = 'accept';
    else if (pad.pressed('east')) key = 'back';
    else if (pad.pressed('up')) key = 'up';
    else if (pad.pressed('down')) key = 'down';
    else if (pad.pressed('left')) key = 'left';
    else if (pad.pressed('right')) key = 'right';
    else if (tilt.x === 0 && sx !== 0) key = sx > 0 ? 'right' : 'left';
    else if (tilt.y === 0 && sy !== 0) key = sy > 0 ? 'down' : 'up';

    // 按钮边沿与轴边沿都要同步，否则同一次十字键按下会被算两次。
    tilt.x = sx;
    tilt.y = sy;
    return { key, connected: pad.connected };
  }

  return {
    step,
    reset() {
      tilt.x = 0;
      tilt.y = 0;
    },
  };
}

function snap(value: number): number {
  if (value > TILT) return 1;
  if (value < -TILT) return -1;
  return 0;
}
