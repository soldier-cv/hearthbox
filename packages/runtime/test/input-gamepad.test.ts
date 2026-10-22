import { describe, expect, it } from 'vitest';
import { createGamepadSource } from '../src/input-gamepad.js';
import { createRawDeviceState } from '../src/input-source.js';

function fakePad(overrides: Partial<Gamepad> = {}): Gamepad {
  const buttons = Array.from({ length: 16 }, () => ({ pressed: false, touched: false, value: 0 }));
  return {
    id: 'Xbox Wireless Controller (STANDARD GAMEPAD Vendor: 045e Product: 02fd)',
    index: 0,
    connected: true,
    mapping: 'standard',
    axes: [0, 0, 0, 0],
    buttons: buttons as GamepadButton[],
    timestamp: 0,
    vibrationActuator: null,
    ...overrides,
  } as unknown as Gamepad;
}

describe('createGamepadSource', () => {
  it('没有手柄时 connected=false', () => {
    const source = createGamepadSource({ getGamepads: () => [] });
    source.start();
    const raw = createRawDeviceState();
    source.drain(raw);
    expect(raw.connected).toBe(false);
  });

  it('读取轴与扳机', () => {
    const pad = fakePad({ axes: [0.5, -0.5, 0.25, 0.1] });
    pad.buttons[7] = { pressed: false, touched: true, value: 0.6 } as GamepadButton;
    const source = createGamepadSource({ getGamepads: () => [pad] });
    source.start();
    const raw = createRawDeviceState();
    source.drain(raw);

    expect(raw.connected).toBe(true);
    expect(raw.lx).toBeCloseTo(0.5);
    expect(raw.ly).toBeCloseTo(-0.5);
    expect(raw.rx).toBeCloseTo(0.25);
    expect(raw.rt).toBeCloseTo(0.6);
  });

  it('标准映射下 A 键是 south', () => {
    const pad = fakePad();
    pad.buttons[0] = { pressed: true, touched: true, value: 1 } as GamepadButton;
    const source = createGamepadSource({ getGamepads: () => [pad] });
    source.start();
    const raw = createRawDeviceState();
    source.drain(raw);
    // south 的位是 0
    expect(raw.buttons & 1).toBe(1);
  });

  it('D-pad 同时写入 hat，供 move 合并', () => {
    const pad = fakePad();
    pad.buttons[12] = { pressed: true, touched: true, value: 1 } as GamepadButton; // up
    const source = createGamepadSource({ getGamepads: () => [pad] });
    source.start();
    const raw = createRawDeviceState();
    source.drain(raw);
    expect(raw.hatY).toBe(-1);
  });

  it('记录设备 key 用于 profile 匹配', () => {
    const source = createGamepadSource({ getGamepads: () => [fakePad()] });
    source.start();
    const raw = createRawDeviceState();
    source.drain(raw);
    expect(raw.deviceKey).toContain('standard');
  });
});
