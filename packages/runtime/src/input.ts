import type { InputView, PadState } from '@hearthbox/sdk';
import { applyRadialDeadzone, applyTriggerDeadzone, mergeMove, snapAxis } from './deadzone.js';
import {
  bitOf,
  createRawDeviceState,
  type InputSource,
  type RawDeviceState,
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
  /** 每帧调用一次，把各源的状态写入内部预分配的 PadState。 */
  sample(): void;
  /** 长度恒为 4，元素跨帧复用，调用方不得保存引用。 */
  players(): readonly PadState[];
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
}

export function createInput(deps: InputDeps): Input {
  const options: InputOptions = { ...DEFAULT_INPUT_OPTIONS, ...deps.options };
  const now = deps.now ?? (() => performance.now());
  const sources = deps.sources;

  const pads: MutablePadState[] = [];
  for (let i = 0; i < 4; i += 1) pads.push(createPadState());

  // 每个源一份原始状态，永不重新分配。
  const raws: RawDeviceState[] = sources.map(() => createRawDeviceState());

  // 每帧按玩家槽位合并，使用定长数组，避免分配。
  const frameButtons = new Int32Array(4);
  const frameTouches = new Int32Array(4);
  const frameConnected = new Uint8Array(4);

  let startSelectSince = -1;
  let menuRequested = false;

  const scratchVector = { x: 0, y: 0 };
  const mergeScratch = { x: 0, y: 0 };

  function sample(): void {
    frameButtons.fill(0);
    frameTouches.fill(0);
    frameConnected.fill(0);

    for (let s = 0; s < sources.length; s += 1) {
      const raw = raws[s]!;
      raw.buttons = 0;
      raw.touches = 0;
      raw.deviceKey = '';
      raw.hatX = 0;
      raw.hatY = 0;
      sources[s]!.drain(raw);

      if (!raw.connected) continue;

      const slot = raw.slot >= 0 && raw.slot < 4 ? raw.slot : s % 4;
      frameConnected[slot] = 1;

      // D-pad 以轴上报时也折算成按钮位，保证 held('left') 与 move 一致。
      const dpad = hatBits(raw.hatX, raw.hatY);
      const buttons = raw.buttons | dpad;

      frameButtons[slot] = (frameButtons[slot] ?? 0) | buttons;
      // touches 包含"帧内按下又松开"的键，这些键不在 buttons 里了。
      frameTouches[slot] = (frameTouches[slot] ?? 0) | raw.touches | buttons;

      writeAxes(pads[slot]!, raw);
    }

    for (let slot = 0; slot < 4; slot += 1) {
      const pad = pads[slot]!;
      const previous = pad.heldMask;
      const connected = frameConnected[slot] === 1;
      const current = connected ? (frameButtons[slot] ?? 0) : 0;

      pad.connected = connected;
      pad.heldMask = current;
      // 本帧出现过的按下：当前按住且上帧没按，或帧内触碰过且上帧没按。
      pad.pressedMask = connected ? (frameTouches[slot] ?? 0) & ~previous : 0;
      pad.releasedMask = previous & ~current;

      if (!connected) {
        pad.lx = 0;
        pad.ly = 0;
        pad.rx = 0;
        pad.ry = 0;
        pad.lt = 0;
        pad.rt = 0;
        pad.move.x = 0;
        pad.move.y = 0;
      }
    }

    if (options.swapSouthEast) swapSouthEast();
    updateSystemMenu();
  }

  function writeAxes(pad: MutablePadState, raw: RawDeviceState): void {
    // 左摇杆先过死区，得到 lx/ly。
    applyRadialDeadzone(raw.lx, raw.ly, options.deadzone, options.outerDeadzone, scratchVector);
    pad.lx = scratchVector.x;
    pad.ly = scratchVector.y;

    // move = 摇杆与 D-pad 取较长者。
    mergeMove(pad.lx, pad.ly, raw.hatX, raw.hatY, mergeScratch);
    pad.move.x = mergeScratch.x;
    pad.move.y = mergeScratch.y;

    // 右摇杆同样过死区，但不参与 move。
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
export function inputView(input: Input): InputView {
  const players = input.players();
  return {
    get p1() {
      return players[0]!;
    },
    get players() {
      return players;
    },
  };
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
