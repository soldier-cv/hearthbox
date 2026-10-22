import type { PadState, PointerButton } from '@hearthbox/sdk';
import type { Display } from './display.js';
import { applyRadialDeadzone, applyTriggerDeadzone, mergeMove, snapAxis } from './deadzone.js';
import {
  bitOf,
  createRawKeyboardState,
  createRawPadState,
  createRawPointerState,
  pointerBit,
  type InputSource,
  type RawInputTarget,
  type RawKeyboardState,
  type RawPadState,
  type RawPointerState,
} from './input-source.js';
import { createPadState, type MutablePadState } from './pad-state.js';

export interface InputOptions {
  /** 径向死区，默认 0.15。 */
  deadzone: number;
  /** 外圈饱和，默认 0.95。 */
  outerDeadzone: number;
  /** 扳机死区，默认 0.05。 */
  triggerDeadzone: number;
  /** 任天堂布局，默认 false。为真时交换 south/east。 */
  swapSouthEast: boolean;
}

export const DEFAULT_INPUT_OPTIONS: InputOptions = {
  deadzone: 0.15,
  outerDeadzone: 0.95,
  triggerDeadzone: 0.05,
  swapSouthEast: false,
};

/** start+select 要按住多久才算系统菜单请求。 */
const SYSTEM_MENU_HOLD_MS = 1000;

export interface Input {
  /** 每帧调用一次，把各源的状态写入内部预分配的视图。 */
  sample(): void;
  /** 长度恒为 4，元素跨帧复用，调用方不得保存引用。 */
  players(): readonly PadState[];
  keyboard(): KeyboardView;
  pointer(): PointerView;
  /** 本帧是否触发了保留组合键。读一次即清空。 */
  systemMenuRequested(): boolean;
  /** 动态调整死区等参数（设置页使用）。 */
  configure(options: Partial<InputOptions>): void;
}

/** 键盘视图的运行时实现（对外只暴露 sdk 的只读接口）。 */
export interface KeyboardView {
  readonly connected: boolean;
  held(code: string): boolean;
  pressed(code: string): boolean;
  released(code: string): boolean;
  readonly heldCodes: readonly string[];
}

/** 指针视图的运行时实现。 */
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

export interface InputDeps {
  sources: InputSource[];
  options?: Partial<InputOptions>;
  /** 注入时钟，便于测试。返回毫秒。 */
  now?: () => number;
  /**
   * 把客户端坐标换算成逻辑像素。
   * 由宿主用 display 的变换提供；缺省时按 1:1 处理（测试用）。
   */
  clientToLogical?: (clientX: number, clientY: number) => { x: number; y: number };
}

export function createInput(deps: InputDeps): Input {
  const options: InputOptions = { ...DEFAULT_INPUT_OPTIONS, ...deps.options };
  const now = deps.now ?? (() => performance.now());
  const sources = deps.sources;
  const toLogical = deps.clientToLogical ?? defaultClientToLogical;

  const pads: MutablePadState[] = [];
  for (let i = 0; i < 4; i += 1) pads.push(createPadState());

  // 每个源一份独立的 target；手柄部分各自独占一个 pad，键盘/指针共用。
  const targets: RawInputTarget[] = sources.map(() => ({
    pad: createRawPadState(),
    keyboard: createRawKeyboardState(),
    pointer: createRawPointerState(),
  }));

  const sharedKeyboard = createRawKeyboardState();
  const sharedPointer = createRawPointerState();

  const frameButtons = new Int32Array(4);
  const frameTouches = new Int32Array(4);
  const frameConnected = new Uint8Array(4);

  let startSelectSince = -1;
  let menuRequested = false;

  // 键盘视图：集合跨帧复用，游戏只读。
  const keyboardHeld = new Set<string>();
  const keyboardPressed = new Set<string>();
  const keyboardReleased = new Set<string>();
  let keyboardCodes: string[] = [];

  // 指针视图：上次逻辑坐标用于算 dx/dy。
  let pointerX = 0;
  let pointerY = 0;
  let pointerPrevX = 0;
  let pointerPrevY = 0;
  let pointerMoved = false;
  let pointerWheel = 0;
  let pointerInside = false;
  let pointerConnected = false;
  let pointerHeldMask = 0;
  let pointerPressedMask = 0;
  let pointerReleasedMask = 0;

  const keyboardView: KeyboardView = {
    get connected() {
      return sharedKeyboard.connected;
    },
    held: (code) => keyboardHeld.has(code),
    pressed: (code) => keyboardPressed.has(code),
    released: (code) => keyboardReleased.has(code),
    get heldCodes() {
      return keyboardCodes;
    },
  };

  const pointerView: PointerView = {
    get connected() {
      return pointerConnected;
    },
    get inside() {
      return pointerInside;
    },
    get x() {
      return pointerX;
    },
    get y() {
      return pointerY;
    },
    get moved() {
      return pointerMoved;
    },
    get dx() {
      return pointerX - pointerPrevX;
    },
    get dy() {
      return pointerY - pointerPrevY;
    },
    get wheel() {
      return pointerWheel;
    },
    held: (button) => (pointerHeldMask & pointerBit(button)) !== 0,
    pressed: (button) => (pointerPressedMask & pointerBit(button)) !== 0,
    released: (button) => (pointerReleasedMask & pointerBit(button)) !== 0,
  };

  function sample(): void {
    frameButtons.fill(0);
    frameTouches.fill(0);
    frameConnected.fill(0);

    // 共享槽位每帧重置；源写入即视为存在。
    resetKeyboard(sharedKeyboard);
    sharedPointer.heldMask = 0;
    sharedPointer.pressedMask = 0;
    sharedPointer.releasedMask = 0;
    sharedPointer.wheel = 0;

    for (let s = 0; s < sources.length; s += 1) {
      const target = targets[s]!;
      target.pad.buttons = 0;
      target.pad.touches = 0;
      target.pad.deviceKey = '';
      target.pad.hatX = 0;
      target.pad.hatY = 0;
      // 让该源看到最新共享状态，它只需往里写。
      target.keyboard = sharedKeyboard;
      target.pointer = sharedPointer;

      sources[s]!.drain(target);

      const pad = target.pad;
      if (pad.connected) {
        const slot = pad.slot >= 0 && pad.slot < 4 ? pad.slot : s % 4;
        frameConnected[slot] = 1;
        const dpad = hatBits(pad.hatX, pad.hatY);
        const buttons = pad.buttons | dpad;
        frameButtons[slot] = (frameButtons[slot] ?? 0) | buttons;
        frameTouches[slot] = (frameTouches[slot] ?? 0) | pad.touches | buttons;
        writeAxes(pads[slot]!, pad);
      }
    }

    for (let slot = 0; slot < 4; slot += 1) {
      const pad = pads[slot]!;
      const previous = pad.heldMask;
      const connected = frameConnected[slot] === 1;
      const current = connected ? (frameButtons[slot] ?? 0) : 0;

      pad.connected = connected;
      pad.heldMask = current;
      pad.pressedMask = connected ? (frameTouches[slot] ?? 0) & ~previous : 0;
      pad.releasedMask = previous & ~current;

      if (!connected) clearPad(pad);
    }

    if (options.swapSouthEast) swapSouthEast();
    updateSystemMenu();
    updateKeyboardView();
    updatePointerView();
  }

  function updateKeyboardView(): void {
    keyboardHeld.clear();
    keyboardPressed.clear();
    keyboardReleased.clear();
    for (const code of sharedKeyboard.held) keyboardHeld.add(code);
    for (const code of sharedKeyboard.pressed) keyboardPressed.add(code);
    for (const code of sharedKeyboard.released) keyboardReleased.add(code);
    keyboardCodes = [...keyboardHeld];
  }

  function updatePointerView(): void {
    pointerConnected = sharedPointer.connected;
    pointerPrevX = pointerX;
    pointerPrevY = pointerY;

    if (pointerConnected) {
      const logical = toLogical(sharedPointer.clientX, sharedPointer.clientY);
      pointerX = logical.x;
      pointerY = logical.y;
      pointerInside = sharedPointer.inside;
      pointerHeldMask = sharedPointer.heldMask;
      pointerPressedMask = sharedPointer.pressedMask;
      pointerReleasedMask = sharedPointer.releasedMask;
      pointerWheel = sharedPointer.wheel;
      pointerMoved = pointerX !== pointerPrevX || pointerY !== pointerPrevY;
    } else {
      pointerInside = false;
      pointerHeldMask = 0;
      pointerPressedMask = 0;
      pointerReleasedMask = 0;
      pointerWheel = 0;
      pointerMoved = false;
    }
  }

  function writeAxes(pad: MutablePadState, raw: RawPadState): void {
    applyRadialDeadzone(raw.lx, raw.ly, options.deadzone, options.outerDeadzone, scratchVector);
    pad.lx = scratchVector.x;
    pad.ly = scratchVector.y;

    mergeMove(pad.lx, pad.ly, raw.hatX, raw.hatY, mergeScratch);
    pad.move.x = mergeScratch.x;
    pad.move.y = mergeScratch.y;

    applyRadialDeadzone(raw.rx, raw.ry, options.deadzone, options.outerDeadzone, scratchVector);
    pad.rx = scratchVector.x;
    pad.ry = scratchVector.y;

    pad.lt = applyTriggerDeadzone(raw.lt, options.triggerDeadzone);
    pad.rt = applyTriggerDeadzone(raw.rt, options.triggerDeadzone);
  }

  function swapSouthEast(): void {
    const south = bitOf('south');
    const east = bitOf('east');
    if (south < 0 || east < 0) return;
    for (let slot = 0; slot < 4; slot += 1) {
      const pad = pads[slot]!;
      pad.heldMask = swapBits(pad.heldMask, south, east);
      pad.pressedMask = swapBits(pad.pressedMask, south, east);
      pad.releasedMask = swapBits(pad.releasedMask, south, east);
    }
  }

  function updateSystemMenu(): void {
    const pad = pads[0]!;
    const held = pad.heldMask;
    const start = bitOf('start');
    const select = bitOf('select');
    const both =
      start >= 0 && select >= 0 && (held & (1 << start)) !== 0 && (held & (1 << select)) !== 0;

    if (!both) {
      startSelectSince = -1;
      return;
    }
    if (startSelectSince < 0) startSelectSince = now();
    if (now() - startSelectSince >= SYSTEM_MENU_HOLD_MS) {
      menuRequested = true;
      startSelectSince = -1;
    }
  }

  return {
    sample,
    players: () => pads,
    keyboard: () => keyboardView,
    pointer: () => pointerView,
    systemMenuRequested: () => {
      const requested = menuRequested;
      menuRequested = false;
      return requested;
    },
    configure: (partial) => {
      Object.assign(options, partial);
    },
  };
}

/** 供宿主持有的只读视图，避免每帧 getter 分配。 */
export function inputView(input: Input): {
  readonly p1: PadState;
  readonly players: readonly PadState[];
  readonly keyboard: KeyboardView;
  readonly pointer: PointerView;
} {
  const players = input.players();
  const keyboard = input.keyboard();
  const pointer = input.pointer();
  return {
    get p1() {
      return players[0]!;
    },
    get players() {
      return players;
    },
    keyboard,
    pointer,
  };
}

const scratchVector = { x: 0, y: 0 };
const mergeScratch = { x: 0, y: 0 };

function defaultClientToLogical(clientX: number, clientY: number): { x: number; y: number } {
  return { x: clientX, y: clientY };
}

function resetKeyboard(keyboard: RawKeyboardState): void {
  keyboard.connected = false;
  keyboard.held.clear();
  keyboard.pressed.clear();
  keyboard.released.clear();
}

function clearPad(pad: MutablePadState): void {
  pad.lx = 0;
  pad.ly = 0;
  pad.rx = 0;
  pad.ry = 0;
  pad.lt = 0;
  pad.rt = 0;
  pad.move.x = 0;
  pad.move.y = 0;
}

function hatBits(hatX: number, hatY: number): number {
  const x = snapAxis(hatX);
  const y = snapAxis(hatY);
  let mask = 0;
  if (x < 0) mask |= 1 << bitOf('left');
  if (x > 0) mask |= 1 << bitOf('right');
  if (y < 0) mask |= 1 << bitOf('up');
  if (y > 0) mask |= 1 << bitOf('down');
  return mask;
}

function swapBits(mask: number, a: number, b: number): number {
  const abit = (mask >> a) & 1;
  const bbit = (mask >> b) & 1;
  if (abit === bbit) return mask;
  return mask ^ (1 << a) ^ (1 << b);
}

export type { RawPointerState, RawKeyboardState, Display };
