import type { InputView, PadState } from '@hearthbox/sdk';
import { applyRadialDeadzone, applyTriggerDeadzone, mergeMove, snapAxis } from './deadzone.js';
import {
  bitOf,
  createRawKeyboardState,
  createRawPadState,
  createRawPointerState,
  type InputSource,
  type RawInputTarget,
  type RawPadState,
} from './input-source.js';
import {
  createKeyboardView,
  createPointerView,
  type KeyboardView,
  type PointerView,
} from './input-views.js';
import { createPadState, type MutablePadState } from './pad-state.js';

export type { KeyboardView, PointerView } from './input-views.js';

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
const MENU_HOLD_MS = 1000;

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
  const toLogical = deps.clientToLogical ?? ((x, y) => ({ x, y }));

  const pads: MutablePadState[] = [];
  for (let i = 0; i < 4; i += 1) pads.push(createPadState());

  // 每个源一份独立 target；手柄各自独占 pad，键盘/指针共享。
  const targets: RawInputTarget[] = sources.map(() => ({
    pad: createRawPadState(),
    keyboard: createRawKeyboardState(),
    pointer: createRawPointerState(),
  }));
  const sharedKeyboard = createRawKeyboardState();
  const sharedPointer = createRawPointerState();

  // 定长数组，避免每帧分配。
  const frameButtons = new Int32Array(4);
  const frameTouches = new Int32Array(4);
  const frameConnected = new Uint8Array(4);

  const keyboard = createKeyboardView();
  const pointer = createPointerView();

  let startSelectSince = -1;
  let menuRequested = false;

  const scratch = { x: 0, y: 0 };

  function sample(): void {
    frameButtons.fill(0);
    frameTouches.fill(0);
    frameConnected.fill(0);

    resetShared();

    for (let index = 0; index < sources.length; index += 1) {
      const target = targets[index]!;
      resetTarget(target);
      sources[index]!.drain(target);
      collectPad(target.pad, index);
    }

    commitPads();
    if (options.swapSouthEast) swapSouthEast();
    updateMenu();

    keyboard.update(sharedKeyboard);
    pointer.update(sharedPointer, toLogical);
  }

  function resetShared(): void {
    sharedKeyboard.connected = false;
    sharedKeyboard.held.clear();
    sharedKeyboard.pressed.clear();
    sharedKeyboard.released.clear();
    sharedPointer.heldMask = 0;
    sharedPointer.pressedMask = 0;
    sharedPointer.releasedMask = 0;
    sharedPointer.wheel = 0;
  }

  function resetTarget(target: RawInputTarget): void {
    target.pad.buttons = 0;
    target.pad.touches = 0;
    target.pad.deviceKey = '';
    target.pad.hatX = 0;
    target.pad.hatY = 0;
    target.keyboard = sharedKeyboard;
    target.pointer = sharedPointer;
  }

  function collectPad(raw: RawPadState, index: number): void {
    if (!raw.connected) return;
    const slot = raw.slot >= 0 && raw.slot < 4 ? raw.slot : index % 4;
    frameConnected[slot] = 1;

    const dir = hatBits(raw.hatX, raw.hatY);
    const buttons = raw.buttons | dir;
    frameButtons[slot] = (frameButtons[slot] ?? 0) | buttons;
    frameTouches[slot] = (frameTouches[slot] ?? 0) | raw.touches | buttons;

    writeAxes(pads[slot]!, raw);
  }

  function commitPads(): void {
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
  }

  function writeAxes(pad: MutablePadState, raw: RawPadState): void {
    applyRadialDeadzone(raw.lx, raw.ly, options.deadzone, options.outerDeadzone, scratch);
    pad.lx = scratch.x;
    pad.ly = scratch.y;

    mergeMove(pad.lx, pad.ly, raw.hatX, raw.hatY, scratch);
    pad.move.x = scratch.x;
    pad.move.y = scratch.y;

    applyRadialDeadzone(raw.rx, raw.ry, options.deadzone, options.outerDeadzone, scratch);
    pad.rx = scratch.x;
    pad.ry = scratch.y;

    pad.lt = applyTriggerDeadzone(raw.lt, options.triggerDeadzone);
    pad.rt = applyTriggerDeadzone(raw.rt, options.triggerDeadzone);
  }

  function swapSouthEast(): void {
    const south = bitOf('south');
    const east = bitOf('east');
    for (const pad of pads) {
      pad.heldMask = swapBits(pad.heldMask, south, east);
      pad.pressedMask = swapBits(pad.pressedMask, south, east);
      pad.releasedMask = swapBits(pad.releasedMask, south, east);
    }
  }

  function updateMenu(): void {
    const held = pads[0]!.heldMask;
    const both = (held & (1 << bitOf('start'))) !== 0 && (held & (1 << bitOf('select'))) !== 0;

    if (!both) {
      startSelectSince = -1;
      return;
    }
    if (startSelectSince < 0) startSelectSince = now();
    if (now() - startSelectSince >= MENU_HOLD_MS) {
      menuRequested = true;
      startSelectSince = -1;
    }
  }

  return {
    sample,
    players: () => pads,
    keyboard: () => keyboard.view,
    pointer: () => pointer.view,
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

/** 供宿主持有的只读视图。 */
export function inputView(input: Input): InputView {
  const players = input.players();
  return {
    get p1() {
      return players[0]!;
    },
    get players() {
      return players;
    },
    keyboard: input.keyboard(),
    pointer: input.pointer(),
  };
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
