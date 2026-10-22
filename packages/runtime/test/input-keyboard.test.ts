import { describe, expect, it } from 'vitest';
import { createInput } from '../src/input.js';
import { createKeyboardSource } from '../src/input-keyboard.js';
import { createRawDeviceState } from '../src/input-source.js';
import { dispatchKey, FakeTarget } from './fake-keyboard.js';

describe('createKeyboardSource', () => {
  it('方向键映射成 up/down/left/right', () => {
    const target = new FakeTarget();
    const source = createKeyboardSource({ target });
    source.start();

    dispatchKey(target, 'keydown', 'ArrowRight');
    const raw = createRawDeviceState();
    source.drain(raw);
    expect(raw.buttons & (1 << 15)).toBe(1 << 15);

    dispatchKey(target, 'keyup', 'ArrowRight');
    source.drain(raw);
    expect(raw.buttons & (1 << 15)).toBe(0);
    source.stop();
  });

  it('J 是 south，Enter 是 start', () => {
    const target = new FakeTarget();
    const source = createKeyboardSource({ target });
    source.start();
    dispatchKey(target, 'keydown', 'KeyJ');
    dispatchKey(target, 'keydown', 'Enter');
    const raw = createRawDeviceState();
    source.drain(raw);
    expect(raw.buttons & 1).toBe(1); // south = bit 0
    expect(raw.buttons & (1 << 10)).toBe(1 << 10); // start = bit 10
    source.stop();
  });

  it('方向键同时写入 hat', () => {
    const target = new FakeTarget();
    const source = createKeyboardSource({ target });
    source.start();
    dispatchKey(target, 'keydown', 'ArrowLeft');
    const raw = createRawDeviceState();
    source.drain(raw);
    expect(raw.hatX).toBe(-1);
    source.stop();
  });

  it('stop 之后不再接收按键', () => {
    const target = new FakeTarget();
    const source = createKeyboardSource({ target });
    source.start();
    source.stop();
    dispatchKey(target, 'keydown', 'KeyJ');
    const raw = createRawDeviceState();
    source.drain(raw);
    expect(raw.connected).toBe(false);
  });

  it('窗口失焦时清空按住状态', () => {
    const target = new FakeTarget();
    const source = createKeyboardSource({ target });
    source.start();
    dispatchKey(target, 'keydown', 'KeyJ');
    target.dispatchEvent(new Event('blur'));
    const raw = createRawDeviceState();
    source.drain(raw);
    expect(raw.buttons).toBe(0);
    source.stop();
  });

  it('自动重复不算新的按下', () => {
    const target = new FakeTarget();
    const source = createKeyboardSource({ target });
    source.start();
    dispatchKey(target, 'keydown', 'KeyJ');
    const raw = createRawDeviceState();
    source.drain(raw);
    expect(raw.touches & 1).toBe(1);

    dispatchKey(target, 'keydown', 'KeyJ', true);
    source.drain(raw);
    expect(raw.touches & 1).toBe(0);
    source.stop();
  });
});

describe('键盘 + 汇总层', () => {
  it('键盘按下能让游戏看到 pressed', () => {
    const target = new FakeTarget();
    const source = createKeyboardSource({ target });
    const input = createInput({ sources: [source] });
    source.start();

    dispatchKey(target, 'keydown', 'KeyJ');
    input.sample();
    const p1 = input.players()[0]!;
    expect(p1.connected).toBe(true);
    expect(p1.pressed('south')).toBe(true);
    expect(p1.held('south')).toBe(true);
    source.stop();
  });
});
