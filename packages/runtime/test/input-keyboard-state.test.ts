import { describe, expect, it } from 'vitest';
import { createInput } from '../src/input.js';
import { createFakeSource } from './fake-source.js';

/**
 * 键盘：两套用法并存。
 *
 * 1. `input.p1.held('left')` —— 平台预设映射，适合"只要上下左右"的小游戏
 * 2. `input.keyboard.held('KeyA')` —— 完整物理键位，适合有自己按键方案的游戏
 */
describe('键盘输入', () => {
  it('完整键位状态：held / pressed / released', () => {
    const source = createFakeSource();
    const input = createInput({ sources: [source] });
    source.start();
    source.keyboard.connected = true;

    source.pressKey('KeyA');
    input.sample();
    expect(input.keyboard().held('KeyA')).toBe(true);
    expect(input.keyboard().pressed('KeyA')).toBe(true);

    // 持续按住：不再 pressed
    input.sample();
    expect(input.keyboard().pressed('KeyA')).toBe(false);
    expect(input.keyboard().held('KeyA')).toBe(true);

    source.releaseKey('KeyA');
    input.sample();
    expect(input.keyboard().released('KeyA')).toBe(true);
    expect(input.keyboard().held('KeyA')).toBe(false);
  });

  it('heldCodes 反映当前按住的全部键', () => {
    const source = createFakeSource();
    const input = createInput({ sources: [source] });
    source.start();
    source.keyboard.connected = true;

    source.pressKey('KeyW');
    source.pressKey('KeyD');
    input.sample();

    const codes = [...input.keyboard().heldCodes].sort();
    expect(codes).toEqual(['KeyD', 'KeyW']);
  });

  it('没有键盘时 connected=false', () => {
    const source = createFakeSource();
    const input = createInput({ sources: [source] });
    source.start();
    input.sample();
    expect(input.keyboard().connected).toBe(false);
  });

  it('键位与手柄预设互不影响：KeyZ 只进 keyboard', () => {
    const source = createFakeSource();
    const input = createInput({ sources: [source] });
    source.start();
    source.keyboard.connected = true;

    source.pressKey('KeyZ');
    input.sample();

    // 没映射到任何手柄按钮
    expect(input.players()[0]!.held('south')).toBe(false);
    // 但键盘层看得到
    expect(input.keyboard().held('KeyZ')).toBe(true);
  });
});
