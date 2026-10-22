import { describe, expect, it } from 'vitest';
import { createInput } from '../src/input.js';
import { createFakeSource } from './fake-source.js';

/** 模拟 display 的坐标换算：画布 CSS 尺寸 640×360，逻辑 320×180，即 2 倍。 */
const twoX = (clientX: number, clientY: number) => ({ x: clientX / 2, y: clientY / 2 });

describe('鼠标 / 指针输入', () => {
  it('客户端坐标经显示变换换算成逻辑坐标', () => {
    const source = createFakeSource();
    const input = createInput({ sources: [source], clientToLogical: twoX });
    source.start();
    source.pointer.connected = true;

    source.movePointer(320, 180);
    input.sample();

    expect(input.pointer().x).toBeCloseTo(160, 5);
    expect(input.pointer().y).toBeCloseTo(90, 5);
  });

  it('moved 与 dx/dy 反映本帧位移', () => {
    const source = createFakeSource();
    const input = createInput({ sources: [source], clientToLogical: twoX });
    source.start();
    source.pointer.connected = true;

    source.movePointer(100, 100);
    input.sample();

    source.movePointer(140, 120);
    input.sample();

    const pointer = input.pointer();
    expect(pointer.moved).toBe(true);
    expect(pointer.dx).toBeCloseTo(20, 5);
    expect(pointer.dy).toBeCloseTo(10, 5);
  });

  it('点按的边沿：pressed 只在一帧', () => {
    const source = createFakeSource();
    const input = createInput({ sources: [source] });
    source.start();
    source.pointer.connected = true;

    source.pointerDown(0);
    input.sample();
    expect(input.pointer().pressed('left')).toBe(true);
    expect(input.pointer().held('left')).toBe(true);

    input.sample();
    expect(input.pointer().pressed('left')).toBe(false);
    expect(input.pointer().held('left')).toBe(true);

    source.pointerUp(0);
    input.sample();
    expect(input.pointer().released('left')).toBe(true);
    expect(input.pointer().held('left')).toBe(false);
  });

  it('右键与中键互不干扰', () => {
    const source = createFakeSource();
    const input = createInput({ sources: [source] });
    source.start();
    source.pointer.connected = true;

    source.pointerDown(2);
    input.sample();
    expect(input.pointer().held('right')).toBe(true);
    expect(input.pointer().held('left')).toBe(false);
    expect(input.pointer().held('middle')).toBe(false);
  });

  it('滚轮累计只在本帧可见', () => {
    const source = createFakeSource();
    const input = createInput({ sources: [source] });
    source.start();
    source.pointer.connected = true;

    source.wheel(120);
    input.sample();
    expect(input.pointer().wheel).toBe(120);

    input.sample();
    expect(input.pointer().wheel).toBe(0);
  });

  it('没有指针设备时 connected=false，坐标不跳变', () => {
    const source = createFakeSource();
    const input = createInput({ sources: [source], clientToLogical: twoX });
    source.start();
    input.sample();
    expect(input.pointer().connected).toBe(false);
    expect(input.pointer().moved).toBe(false);
  });

  it('三种设备可以同时工作', () => {
    const source = createFakeSource();
    const input = createInput({ sources: [source], clientToLogical: twoX });
    source.start();
    source.raw.connected = true;
    source.keyboard.connected = true;
    source.pointer.connected = true;

    source.raw.lx = 1;
    source.pressKey('KeyK');
    source.pointerDown(0);

    input.sample();

    expect(input.players()[0]!.lx).toBeCloseTo(1, 5);
    expect(input.keyboard().held('KeyK')).toBe(true);
    expect(input.pointer().held('left')).toBe(true);
  });
});
