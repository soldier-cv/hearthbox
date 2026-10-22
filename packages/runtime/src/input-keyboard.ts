import { bitOf, type InputSource, type RawInputTarget } from './input-source.js';

/**
 * 键盘输入源。
 *
 * 存 `KeyboardEvent.code`（物理键位）。游戏可以直接 `input.keyboard.held('KeyA')`，
 * 也可以继续用 `input.p1.held('left')` —— 后者是平台给"只想上下左右"的小游戏
 * 提供的预设映射（见 KEY_PAD_MAP）。
 */

/** PC 开发、遥控器、以及"只想上下左右"的小游戏共用的默认映射。 */
const KEY_PAD_MAP: Readonly<Record<string, string>> = {
  ArrowUp: 'up',
  ArrowDown: 'down',
  ArrowLeft: 'left',
  ArrowRight: 'right',
  KeyW: 'up',
  KeyS: 'down',
  KeyA: 'left',
  KeyD: 'right',
  Space: 'south',
  KeyJ: 'south',
  KeyK: 'east',
  KeyU: 'west',
  KeyI: 'north',
  Enter: 'start',
  ShiftLeft: 'select',
  ShiftRight: 'select',
  KeyQ: 'l1',
  KeyE: 'r1',
};

/** 把"按钮名 → 位"的表预先算好，键位映射在启动时固定，不需要每帧解析。 */
function compilePadMap(source: Readonly<Record<string, string>>): Map<string, number> {
  const compiled = new Map<string, number>();
  for (const [code, button] of Object.entries(source)) {
    const bit = bitOf(button as never);
    if (bit >= 0) compiled.set(code, bit);
  }
  return compiled;
}

export interface KeyboardSourceConfig {
  /** 事件目标，默认 window。测试可注入。 */
  target?: EventTarget | null;
  /** 键位 → 玩家按钮的映射；传空表则只提供 keyboard 状态。 */
  padMap?: Readonly<Record<string, string>>;
  slot?: number;
}

export function createKeyboardSource(config: KeyboardSourceConfig = {}): InputSource {
  const target = config.target ?? (typeof window !== 'undefined' ? window : null);
  const slot = config.slot ?? 0;
  const padMap = compilePadMap(config.padMap ?? KEY_PAD_MAP);

  let running = false;
  /** 当前按住的所有物理键。没映射过的也在里面，供 keyboard 状态查询。 */
  const heldCodes = new Set<string>();
  /** 自上次 drain 以来按下过的物理键。 */
  const tappedCodes = new Set<string>();
  /** 自上次 drain 以来按下过的玩家按钮位（含一帧内按下又松开的）。 */
  let tappedMask = 0;

  function onKeyDown(event: Event): void {
    const keyboard = event as KeyboardEvent;
    if (keyboard.repeat) return;
    const code = keyboard.code;
    // 方向键、空格、Tab 会滚动页面或移动焦点；Enter 会触发默认按钮。壳里都不该发生。
    if (code.startsWith('Arrow') || code === 'Space' || code === 'Enter' || code === 'Tab') {
      keyboard.preventDefault?.();
    }

    heldCodes.add(code);
    tappedCodes.add(code);

    // 只有映射过的键才同时进入手柄预设。
    const bit = padMap.get(code);
    if (bit !== undefined) tappedMask |= 1 << bit;
  }

  function onKeyUp(event: Event): void {
    heldCodes.delete((event as KeyboardEvent).code);
  }

  function onBlur(): void {
    heldCodes.clear();
    tappedCodes.clear();
    tappedMask = 0;
  }

  return {
    id: 'keyboard',
    start() {
      if (running || !target) return;
      running = true;
      target.addEventListener('keydown', onKeyDown);
      target.addEventListener('keyup', onKeyUp);
      target.addEventListener('blur', onBlur);
    },
    stop() {
      if (!running || !target) return;
      running = false;
      target.removeEventListener('keydown', onKeyDown);
      target.removeEventListener('keyup', onKeyUp);
      target.removeEventListener('blur', onBlur);
      onBlur();
    },
    drain(raw: RawInputTarget) {
      if (!running) {
        raw.keyboard.connected = false;
        return;
      }

      // 键盘状态：完整键位，游戏自己判。没按过任何键时仍视为可用（能按键）。
      const kb = raw.keyboard;
      kb.connected = true;
      kb.held.clear();
      kb.pressed.clear();
      for (const code of heldCodes) kb.held.add(code);
      for (const code of tappedCodes) kb.pressed.add(code);
      tappedCodes.clear();

      // 手柄预设：只汇映射过的键，供"只用方向键"的游戏。
      let mask = 0;
      for (const code of heldCodes) {
        const bit = padMap.get(code);
        if (bit !== undefined) mask |= 1 << bit;
      }

      const pad = raw.pad;
      pad.connected = true;
      pad.slot = slot;
      pad.deviceKey = 'keyboard';
      pad.buttons = mask;
      // touches 只装"本帧刚按下"的位。不能用 mask：按住不放的键会被
      // 每帧误判成新的按下，自动重复也会漏过去。
      pad.touches = tappedMask;
      pad.hatX = axisFromMask(mask, 'left', 'right');
      pad.hatY = axisFromMask(mask, 'up', 'down');
      tappedMask = 0;
    },
  };
}

function axisFromMask(mask: number, negative: 'left' | 'up', positive: 'right' | 'down'): number {
  const neg = bitOf(negative);
  const pos = bitOf(positive);
  return ((mask & (1 << pos)) !== 0 ? 1 : 0) - ((mask & (1 << neg)) !== 0 ? 1 : 0);
}
