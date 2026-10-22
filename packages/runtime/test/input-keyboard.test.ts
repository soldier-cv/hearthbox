import { describe, expect, it } from 'vitest';
import { createInput } from '../src/input.js';
import { createKeyboardSource } from '../src/input-keyboard.js';
import {
  createRawKeyboardState,
  createRawPadState,
  createRawPointerState,
} from '../src/input-source.js';
import { dispatchKey, FakeTarget } from './fake-keyboard.js';

function target() {
  return {
    pad: createRawPadState(),
    keyboard: createRawKeyboardState(),
    pointer: createRawPointerState(),
  };
}

describe('createKeyboardSource', () => {
  it('方向键同时进 keyboard 与手柄预设', () => {
    const target2 = new FakeTarget();
    const source = createKeyboardSource({ target: target2 });
    source.start();

    dispatchKey(target2, 'keydown', 'ArrowRight');
    const t = target();
    source.drain(t);

    // 物理键位
    expect(t.keyboard.held.has('ArrowRight')).toBe(true);
    // 预设映射到 right（bit 15）
    expect(t.pad.buttons & (1 << 15)).toBe(1 << 15);
    expect(t.pad.hatX).toBe(1);

    dispatchKey(target2, 'keyup', 'ArrowRight');
    source.drain(t);
    expect(t.keyboard.held.has('ArrowRight')).toBe(false);
    source.stop();
  });

  it('未映射的键只进 keyboard，不影响手柄预设', () => {
    const target2 = new FakeTarget();
    const source = createKeyboardSource({ target: target2 });
    source.start();

    dispatchKey(target2, 'keydown', 'KeyZ');
    const t = target();
    source.drain(t);

    expect(t.keyboard.held.has('KeyZ')).toBe(true);
    expect(t.pad.buttons).toBe(0);
    source.stop();
  });
  it('J 是 south，Enter 是 start', () => {
    const target2 = new FakeTarget();
    const source = createKeyboardSource({ target: target2 });
    source.start();
    dispatchKey(target2, 'keydown', 'KeyJ');
    dispatchKey(target2, 'keydown', 'Enter');
    const t = target();
    source.drain(t);
    expect(t.pad.buttons & 1).toBe(1);
    expect(t.pad.buttons & (1 << 10)).toBe(1 << 10);
    source.stop();
  });

  it('stop 之后不再接收按键', () => {
    const target2 = new FakeTarget();
    const source = createKeyboardSource({ target: target2 });
    source.start();
    source.stop();
    dispatchKey(target2, 'keydown', 'KeyJ');
    const t = target();
    source.drain(t);
    expect(t.keyboard.connected).toBe(false);
  });

  it('窗口失焦时清空按住状态', () => {
    const target2 = new FakeTarget();
    const source = createKeyboardSource({ target: target2 });
    source.start();
    dispatchKey(target2, 'keydown', 'KeyJ');
    target2.dispatchEvent(new Event('blur'));
    const t = target();
    source.drain(t);
    expect(t.pad.buttons).toBe(0);
    expect(t.keyboard.held.size).toBe(0);
    source.stop();
  });

  it('自动重复不算新的按下', () => {
    const target2 = new FakeTarget();
    const source = createKeyboardSource({ target: target2 });
    source.start();
    dispatchKey(target2, 'keydown', 'KeyJ');
    const t = target();
    source.drain(t);
    expect(t.pad.touches & 1).toBe(1);

    dispatchKey(target2, 'keydown', 'KeyJ', true);
    source.drain(t);
    expect(t.pad.touches & 1).toBe(0);
    source.stop();
  });

  it('可以关掉手柄预设，只提供完整键位', () => {
    const target2 = new FakeTarget();
    const source = createKeyboardSource({ target: target2, padMap: {} });
    source.start();
    dispatchKey(target2, 'keydown', 'ArrowLeft');
    const t = target();
    source.drain(t);
    expect(t.keyboard.held.has('ArrowLeft')).toBe(true);
    expect(t.pad.buttons).toBe(0);
    source.stop();
  });
});

describe('键盘 + 汇总层', () => {
  it('方向键能让游戏用 p1 移动，也能用 keyboard 查键位', () => {
    const target2 = new FakeTarget();
    const source = createKeyboardSource({ target: target2 });
    const input = createInput({ sources: [source] });
    source.start();

    dispatchKey(target2, 'keydown', 'ArrowUp');
    input.sample();

    const p1 = input.players()[0]!;
    expect(p1.connected).toBe(true);
    expect(p1.pressed('up')).toBe(true);
    expect(input.keyboard().held('ArrowUp')).toBe(true);
    source.stop();
  });
});
