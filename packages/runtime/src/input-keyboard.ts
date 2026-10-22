import { bitOf, type InputSource, type RawDeviceState } from './input-source.js';

/** PC 开发与遥控器共用的键盘映射，见 input.md 第 6 节。 */
const KEY_MAP: Readonly<Record<string, string>> = {
  ArrowUp: 'up',
  ArrowDown: 'down',
  ArrowLeft: 'left',
  ArrowRight: 'right',
  KeyW: 'up',
  KeyS: 'down',
  KeyA: 'left',
  KeyD: 'right',
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

const DEFAULT_KEYS: Record<string, number> = {};
for (const [code, button] of Object.entries(KEY_MAP)) {
  const bit = bitOf(button as never);
  if (bit >= 0) DEFAULT_KEYS[code] = bit;
}

/**
 * 键盘输入源：PC 开发与 Android 遥控器都走这里。
 * 遥控器在 WebView 中表现为方向键、Enter、Escape。
 */
export function createKeyboardSource(
  config: { target?: EventTarget; slot?: number } = {},
): InputSource {
  const target = config.target ?? (typeof window !== 'undefined' ? window : null);
  const slot = config.slot ?? 0;

  let running = false;
  // 当前按住的键 → 位；松开时删掉。用 Map 是为了处理多键同时按。
  const pressed = new Map<string, number>();
  let heldMask = 0;
  let touchedMask = 0;

  function onKeyDown(event: Event): void {
    const keyboard = event as KeyboardEvent;
    const bit = DEFAULT_KEYS[keyboard.code];
    if (bit === undefined) return;
    if (keyboard.repeat) return;
    // 方向键会滚动页面，壳里不该发生。
    if (keyboard.code.startsWith('Arrow') || keyboard.code === 'Enter') {
      keyboard.preventDefault?.();
    }
    pressed.set(keyboard.code, bit);
    heldMask |= 1 << bit;
    touchedMask |= 1 << bit;
  }

  function onKeyUp(event: Event): void {
    const keyboard = event as KeyboardEvent;
    const bit = pressed.get(keyboard.code);
    if (bit === undefined) return;
    pressed.delete(keyboard.code);
    heldMask &= ~(1 << bit);
  }

  function onBlur(): void {
    pressed.clear();
    heldMask = 0;
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
    drain(raw: RawDeviceState) {
      if (!running) {
        raw.connected = false;
        return;
      }
      raw.connected = true;
      raw.slot = slot;
      raw.deviceKey = 'keyboard';
      raw.buttons = heldMask;
      raw.touches = touchedMask;
      raw.hatX = axisFromMask(heldMask, 'left', 'right');
      raw.hatY = axisFromMask(heldMask, 'up', 'down');
      touchedMask = 0;
    },
  };
}

function axisFromMask(mask: number, negative: 'left' | 'up', positive: 'right' | 'down'): number {
  const neg = bitOf(negative);
  const pos = bitOf(positive);
  return ((mask & (1 << pos)) !== 0 ? 1 : 0) - ((mask & (1 << neg)) !== 0 ? 1 : 0);
}
