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
 * 一个输入源每帧写给运行时看的原始状态。
 * 运行时为每个源预分配一份，源只写字段，不创建对象。
 */
export interface RawDeviceState {
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

export function createRawDeviceState(slot = 0): RawDeviceState {
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

export interface InputSource {
  id: string;
  start(): void;
  stop(): void;
  /** 每次固定步调用一次：把自上次以来的事件/状态写入 raw，不分配内存。 */
  drain(raw: RawDeviceState): void;
}
