import {
  bitOf,
  createRawKeyboardState,
  createRawPadState,
  createRawPointerState,
  type InputSource,
  type RawInputTarget,
} from '../src/input-source.js';

export interface FakeSource extends InputSource {
  /** 手柄原始状态；测试直接写字段。 */
  raw: ReturnType<typeof createRawPadState>;
  /** 键盘原始状态。 */
  keyboard: ReturnType<typeof createRawKeyboardState>;
  /** 指针原始状态（客户端坐标）。 */
  pointer: ReturnType<typeof createRawPointerState>;
  press(button: string): void;
  pressKey(code: string): void;
  releaseKey(code: string): void;
  movePointer(clientX: number, clientY: number): void;
  pointerDown(button: 0 | 1 | 2): void;
  pointerUp(button: 0 | 1 | 2): void;
  wheel(delta: number): void;
}

/**
 * 测试用的伪造输入源：直接暴露三份 raw，测试写字段即可。
 */
export function createFakeSource(): FakeSource {
  const raw = createRawPadState();
  const keyboard = createRawKeyboardState();
  const pointer = createRawPointerState();
  let running = false;

  return {
    id: 'fake',
    raw,
    keyboard,
    pointer,

    start() {
      running = true;
    },
    stop() {
      running = false;
    },

    press(button: string) {
      const bit = bitOf(button as never);
      if (bit < 0) throw new Error(`unknown button: ${button}`);
      raw.buttons |= 1 << bit;
    },

    pressKey(code: string) {
      keyboard.held.add(code);
      keyboard.pressed.add(code);
    },
    releaseKey(code: string) {
      keyboard.held.delete(code);
      keyboard.released.add(code);
    },

    movePointer(clientX: number, clientY: number) {
      pointer.clientX = clientX;
      pointer.clientY = clientY;
      pointer.inside = true;
    },
    pointerDown(button) {
      const mask = button === 0 ? 1 : button === 1 ? 2 : 4;
      pointer.heldMask |= mask;
      pointer.pressedMask |= mask;
    },
    pointerUp(button) {
      const mask = button === 0 ? 1 : button === 1 ? 2 : 4;
      pointer.heldMask &= ~mask;
      pointer.releasedMask |= mask;
    },
    wheel(delta: number) {
      pointer.wheel += delta;
    },

    drain(target: RawInputTarget) {
      if (!running) {
        target.pad.connected = false;
        target.keyboard.connected = false;
        target.pointer.connected = false;
        return;
      }

      target.pad.connected = raw.connected;
      target.pad.buttons = raw.buttons;
      target.pad.touches = raw.touches;
      raw.touches = 0;
      target.pad.lx = raw.lx;
      target.pad.ly = raw.ly;
      target.pad.rx = raw.rx;
      target.pad.ry = raw.ry;
      target.pad.lt = raw.lt;
      target.pad.rt = raw.rt;
      target.pad.hatX = raw.hatX;
      target.pad.hatY = raw.hatY;
      target.pad.deviceKey = raw.deviceKey;
      target.pad.slot = raw.slot;

      target.keyboard.connected = keyboard.connected;
      target.keyboard.held.clear();
      target.keyboard.pressed.clear();
      target.keyboard.released.clear();
      for (const code of keyboard.held) target.keyboard.held.add(code);
      for (const code of keyboard.pressed) target.keyboard.pressed.add(code);
      for (const code of keyboard.released) target.keyboard.released.add(code);
      keyboard.pressed.clear();
      keyboard.released.clear();

      target.pointer.connected = pointer.connected;
      target.pointer.inside = pointer.inside;
      target.pointer.clientX = pointer.clientX;
      target.pointer.clientY = pointer.clientY;
      target.pointer.heldMask = pointer.heldMask;
      target.pointer.pressedMask = pointer.pressedMask;
      target.pointer.releasedMask = pointer.releasedMask;
      target.pointer.wheel = pointer.wheel;
      pointer.pressedMask = 0;
      pointer.releasedMask = 0;
      pointer.wheel = 0;
    },
  };
}
