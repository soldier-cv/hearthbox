import type { PointerButton } from '@hearthbox/sdk';
import type { RawKeyboardState, RawPointerState } from './input-source.js';
import { pointerBit } from './input-source.js';

/** 键盘视图：持有跨帧复用的集合，游戏只读。 */
export interface KeyboardView {
  readonly connected: boolean;
  held(code: string): boolean;
  pressed(code: string): boolean;
  released(code: string): boolean;
  readonly heldCodes: readonly string[];
}

export interface KeyboardViewUpdater {
  readonly view: KeyboardView;
  update(raw: RawKeyboardState): void;
}

export function createKeyboardView(): KeyboardViewUpdater {
  const held = new Set<string>();
  const pressed = new Set<string>();
  const released = new Set<string>();
  let codes: string[] = [];

  const view: KeyboardView = {
    get connected() {
      return current.connected;
    },
    held: (code) => held.has(code),
    pressed: (code) => pressed.has(code),
    released: (code) => released.has(code),
    get heldCodes() {
      return codes;
    },
  };

  let current: RawKeyboardState = {
    connected: false,
    held: new Set(),
    pressed: new Set(),
    released: new Set(),
  };

  return {
    view,
    update(raw) {
      current = raw;
      held.clear();
      pressed.clear();
      released.clear();
      for (const code of raw.held) held.add(code);
      for (const code of raw.pressed) pressed.add(code);
      for (const code of raw.released) released.add(code);
      codes = [...held];
    },
  };
}

/** 指针视图：客户端坐标在这里换算成逻辑像素。 */
export interface PointerView {
  readonly connected: boolean;
  readonly inside: boolean;
  readonly x: number;
  readonly y: number;
  readonly moved: boolean;
  readonly dx: number;
  readonly dy: number;
  readonly wheel: number;
  held(button: PointerButton): boolean;
  pressed(button: PointerButton): boolean;
  released(button: PointerButton): boolean;
}

export interface PointerViewUpdater {
  readonly view: PointerView;
  update(raw: RawPointerState, toLogical: (x: number, y: number) => { x: number; y: number }): void;
}

export function createPointerView(): PointerViewUpdater {
  let x = 0;
  let y = 0;
  let prevX = 0;
  let prevY = 0;
  let moved = false;
  let wheel = 0;
  let inside = false;
  let connected = false;
  let heldMask = 0;
  let pressedMask = 0;
  let releasedMask = 0;

  const view: PointerView = {
    get connected() {
      return connected;
    },
    get inside() {
      return inside;
    },
    get x() {
      return x;
    },
    get y() {
      return y;
    },
    get moved() {
      return moved;
    },
    get dx() {
      return x - prevX;
    },
    get dy() {
      return y - prevY;
    },
    get wheel() {
      return wheel;
    },
    held: (button) => (heldMask & pointerBit(button)) !== 0,
    pressed: (button) => (pressedMask & pointerBit(button)) !== 0,
    released: (button) => (releasedMask & pointerBit(button)) !== 0,
  };

  return {
    view,
    update(raw, toLogical) {
      prevX = x;
      prevY = y;
      connected = raw.connected;

      if (!connected) {
        inside = false;
        heldMask = 0;
        pressedMask = 0;
        releasedMask = 0;
        wheel = 0;
        moved = false;
        return;
      }

      const logical = toLogical(raw.clientX, raw.clientY);
      x = logical.x;
      y = logical.y;
      inside = raw.inside;
      heldMask = raw.heldMask;
      pressedMask = raw.pressedMask;
      releasedMask = raw.releasedMask;
      wheel = raw.wheel;
      moved = x !== prevX || y !== prevY;
    },
  };
}
