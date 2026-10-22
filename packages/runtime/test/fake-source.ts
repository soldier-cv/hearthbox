import {
  bitOf,
  createRawDeviceState,
  type InputSource,
  type RawDeviceState,
} from '../src/input-source.js';

export interface FakeSource extends InputSource {
  raw: RawDeviceState;
  press(button: string): void;
}

/**
 * 测试用的伪造输入源：直接暴露 raw，测试写字段即可。
 * drain 时把 raw 原样交给运行时，不清空按键位（由测试自己控制）。
 */
export function createFakeSource(): FakeSource {
  const raw = createRawDeviceState();
  let running = false;

  return {
    id: 'fake',
    raw,
    start() {
      running = true;
    },
    stop() {
      running = false;
    },
    press(button: string) {
      const bit = bitOf(button as never);
      if (bit < 0) throw new Error(`unknown button: ${button}`);
      raw.buttons |= 1 << bit;
    },
    drain(target: RawDeviceState) {
      if (!running) {
        target.connected = false;
        return;
      }
      target.connected = raw.connected;
      target.buttons = raw.buttons;
      target.touches = raw.touches;
      // 与真实源一致：touches 是自上次 drain 以来的累计，读走即清。
      raw.touches = 0;
      target.lx = raw.lx;
      target.ly = raw.ly;
      target.rx = raw.rx;
      target.ry = raw.ry;
      target.lt = raw.lt;
      target.rt = raw.rt;
      target.hatX = raw.hatX;
      target.hatY = raw.hatY;
      target.deviceKey = raw.deviceKey;
      target.slot = raw.slot;
    },
  };
}
