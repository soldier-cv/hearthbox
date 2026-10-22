import type { Button } from '@hearthbox/sdk';

/**
 * 平台已知的全部按钮位。位序是内部契约，新增只能往后追加。
 * 用位掩码是为了热路径上零分配地比较"本帧按下"与"上一帧按下"。
 */
export const BUTTONS = [
  'south',
  'east',
  'west',
  'north',
  'l1',
  'r1',
  'l2',
  'r2',
  'l3',
  'r3',
  'start',
  'select',
  'up',
  'down',
  'left',
  'right',
] as const satisfies readonly Button[];

export type KnownButton = (typeof BUTTONS)[number];

export const BUTTON_COUNT = BUTTONS.length;

/** 按钮 → 位。未知按钮返回 -1，调用方必须处理。 */
const BIT = new Map<Button, number>();
for (let i = 0; i < BUTTONS.length; i += 1) BIT.set(BUTTONS[i]!, i);

export function bitOf(button: Button): number {
  const bit = BIT.get(button);
  return bit === undefined ? -1 : bit;
}

export function hasBit(mask: number, button: Button): boolean {
  const bit = BIT.get(button);
  return bit !== undefined && (mask & (1 << bit)) !== 0;
}

/**
 * 一个手柄源每帧写给运行时看的原始状态。
 * 运行时为每个源预分配一份，源只写字段，不创建对象。
 */
export interface RawPadState {
  connected: boolean;
  /** 本帧累积的按键位掩码。 */
  buttons: number;
  /** 自上次 drain 以来被按过的按钮位掩码：用于一帧内按下又松开仍算一次 pressed。 */
  touches: number;
  lx: number;
  ly: number;
  rx: number;
  ry: number;
  lt: number;
  rt: number;
  /** D-pad 以轴形式上报时的方向分量，-1..1。 */
  hatX: number;
  hatY: number;
  /** 设备匹配键，用于查找 profile（VID/PID 或 name）。 */
  deviceKey: string;
  /** 分配到的玩家槽位，0..3。 */
  slot: number;
}

/**
 * 键盘原始状态。
 *
 * 存的是 `KeyboardEvent.code`（物理键位），不是字符：同一个键在不同布局下
 * 产生不同字符，游戏要的是"那个键"。字符输入不在 v1 范围内（见 game-sdk.md）。
 *
 * 集合由源持有并跨帧复用，运行时只读不复制，因此这里不是热路径分配点。
 */
export interface RawKeyboardState {
  connected: boolean;
  /** 本帧按住。 */
  held: Set<string>;
  /** 自上次 drain 以来按下过的键（一帧内按下又松开也算）。 */
  pressed: Set<string>;
  /** 自上次 drain 以来松开过的键。 */
  released: Set<string>;
}

export type PointerButton = 'left' | 'middle' | 'right';

export const POINTER_BUTTONS: readonly PointerButton[] = ['left', 'middle', 'right'];

const POINTER_BIT: Record<PointerButton, number> = { left: 1, middle: 2, right: 4 };

export function pointerBit(button: PointerButton): number {
  return POINTER_BIT[button];
}

/**
 * 鼠标 / 触控原始状态。
 *
 * 坐标是**客户端坐标**，由输入汇总层用显示变换换算成逻辑像素。
 * 源不做换算，因为它不知道画布被缩放到了哪里。
 */
export interface RawPointerState {
  connected: boolean;
  /** 指针是否落在画布包围盒内。 */
  inside: boolean;
  /** 最近一次事件的客户端坐标。 */
  clientX: number;
  clientY: number;
  /** 自上次 drain 以来的滚轮累计（像素）。 */
  wheel: number;
  /** 本帧按住 / 本帧按下 / 本帧松开的按钮位。 */
  heldMask: number;
  pressedMask: number;
  releasedMask: number;
}

export function createRawPadState(slot = 0): RawPadState {
  return {
    connected: false,
    buttons: 0,
    touches: 0,
    lx: 0,
    ly: 0,
    rx: 0,
    ry: 0,
    lt: 0,
    rt: 0,
    hatX: 0,
    hatY: 0,
    deviceKey: '',
    slot,
  };
}

export function createRawKeyboardState(): RawKeyboardState {
  return {
    connected: false,
    held: new Set<string>(),
    pressed: new Set<string>(),
    released: new Set<string>(),
  };
}

export function createRawPointerState(): RawPointerState {
  return {
    connected: false,
    inside: false,
    clientX: 0,
    clientY: 0,
    wheel: 0,
    heldMask: 0,
    pressedMask: 0,
    releasedMask: 0,
  };
}

/**
 * 一次 drain 的写入目标。
 *
 * `pad` 是每个源独立的一份（多手柄各自占一个槽位）；
 * `keyboard` 与 `pointer` 是共享的，因为一个设备类别只应有一个源实现，
 * 多个源同时声称提供键盘属于配置错误。
 */
export interface RawInputTarget {
  pad: RawPadState;
  keyboard: RawKeyboardState;
  pointer: RawPointerState;
}

export interface InputSource {
  id: string;
  start(): void;
  stop(): void;
  /** 每次固定步调用一次：把自上次以来的事件/状态写入 target，不分配内存。 */
  drain(target: RawInputTarget): void;
}
