import { describe, expect, it } from 'vitest';
import { createInput } from '../src/input.js';
import { createFakeSource } from './fake-source.js';

describe('createInput', () => {
  it('四个玩家槽位始终存在，未连接时为 connected=false', () => {
    const input = createInput({ sources: [] });
    input.sample();
    const players = input.players();
    expect(players).toHaveLength(4);
    for (const pad of players) expect(pad.connected).toBe(false);
  });

  it('把源的状态写入对应槽位', () => {
    const source = createFakeSource();
    const input = createInput({ sources: [source] });
    source.start();
    source.raw.connected = true;
    source.raw.lx = 1;
    input.sample();

    const p1 = input.players()[0]!;
    expect(p1.connected).toBe(true);
    expect(p1.lx).toBeCloseTo(1, 5);
  });

  it('死区内的摇杆输出为 0', () => {
    const source = createFakeSource();
    const input = createInput({ sources: [source] });
    source.start();
    source.raw.connected = true;
    source.raw.lx = 0.1;
    input.sample();
    expect(input.players()[0]!.lx).toBe(0);
  });

  it('边沿：按住后只在第一帧 pressed', () => {
    const source = createFakeSource();
    const input = createInput({ sources: [source] });
    source.start();
    source.raw.connected = true;

    source.press('south');
    input.sample();
    expect(input.players()[0]!.pressed('south')).toBe(true);
    expect(input.players()[0]!.held('south')).toBe(true);

    input.sample();
    expect(input.players()[0]!.pressed('south')).toBe(false);
    expect(input.players()[0]!.held('south')).toBe(true);
  });

  it('一帧内按下又松开仍产生一次 pressed', () => {
    const source = createFakeSource();
    const input = createInput({ sources: [source] });
    source.start();
    source.raw.connected = true;

    source.raw.buttons = 0;
    source.raw.touches = 1 << 0;
    input.sample();

    const p1 = input.players()[0]!;
    expect(p1.held('south')).toBe(false);
    expect(p1.pressed('south')).toBe(true);
  });

  it('松开时 released 只持续一帧', () => {
    const source = createFakeSource();
    const input = createInput({ sources: [source] });
    source.start();
    source.raw.connected = true;

    source.press('east');
    input.sample();

    source.raw.buttons = 0;
    input.sample();
    expect(input.players()[0]!.released('east')).toBe(true);

    input.sample();
    expect(input.players()[0]!.released('east')).toBe(false);
  });

  it('D-pad 轴折算成按钮，并参与 move', () => {
    const source = createFakeSource();
    const input = createInput({ sources: [source] });
    source.start();
    source.raw.connected = true;
    source.raw.hatX = 1;

    input.sample();
    const p1 = input.players()[0]!;
    expect(p1.held('right')).toBe(true);
    expect(p1.move.x).toBeCloseTo(1, 5);
  });

  it('任天堂布局交换 south/east', () => {
    const source = createFakeSource();
    const input = createInput({ sources: [source], options: { swapSouthEast: true } });
    source.start();
    source.raw.connected = true;
    source.press('south');
    input.sample();

    const p1 = input.players()[0]!;
    expect(p1.held('east')).toBe(true);
    expect(p1.held('south')).toBe(false);
  });

  it('start+select 按住 1 秒触发系统菜单', () => {
    let time = 0;
    const source = createFakeSource();
    const input = createInput({ sources: [source], now: () => time });
    source.start();
    source.raw.connected = true;
    source.press('start');
    source.press('select');

    input.sample();
    expect(input.systemMenuRequested()).toBe(false);

    time = 1000;
    input.sample();
    expect(input.systemMenuRequested()).toBe(true);
    expect(input.systemMenuRequested()).toBe(false);
  });

  it('不分配新的 PadState 对象', () => {
    const source = createFakeSource();
    const input = createInput({ sources: [source] });
    source.start();
    source.raw.connected = true;
    input.sample();
    const first = input.players();
    input.sample();
    expect(input.players()).toBe(first);
  });

  it('多个源按 slot 合并', () => {
    const keyboard = createFakeSource();
    const gamepad = createFakeSource();
    const input = createInput({ sources: [keyboard, gamepad] });
    keyboard.start();
    gamepad.start();

    keyboard.raw.connected = true;
    keyboard.raw.slot = 0;
    keyboard.press('start');

    gamepad.raw.connected = true;
    gamepad.raw.slot = 1;
    gamepad.press('south');

    input.sample();
    const players = input.players();
    expect(players[0]!.held('start')).toBe(true);
    expect(players[1]!.held('south')).toBe(true);
  });

  it('设备断开后轴归零', () => {
    const source = createFakeSource();
    const input = createInput({ sources: [source] });
    source.start();
    source.raw.connected = true;
    source.raw.lx = 1;
    input.sample();
    expect(input.players()[0]!.lx).toBeCloseTo(1, 5);

    source.raw.connected = false;
    input.sample();
    const p1 = input.players()[0]!;
    expect(p1.connected).toBe(false);
    expect(p1.lx).toBe(0);
  });
});
