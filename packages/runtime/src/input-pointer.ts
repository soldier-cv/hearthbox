import type { RawPointerState, RawInputTarget } from './input-source.js';
import type { InputSource } from './input-source.js';

/**
 * 鼠标 / 触控输入源。
 *
 * 只采集**客户端坐标**；换算成逻辑像素由汇总层做，因为只有它知道画布
 * 当前被缩放到了哪里（见 display.ts 的 backing store 与 CSS 尺寸）。
 *
 * 用 Pointer Events 而不是 mouse 事件：它能同时覆盖鼠标、触控、触控笔，
 * 且在 Chromium 87 就有（基线内）。触摸时 `pointerType === 'touch'`，
 * 语义上就是"点一下"，不需要第二套代码。
 */

export interface PointerSourceConfig {
  /** 事件目标，默认 window：画布会在游戏开始后才挂上，提前绑 window 更稳。 */
  target?: EventTarget | null | undefined;
  /** 元素选择器，用它把窗口坐标判成"是否在画布内"。默认第一个 canvas。 */
  canvas?: () => HTMLCanvasElement | null;
}

export function createPointerSource(config: PointerSourceConfig = {}): InputSource {
  const target = config.target ?? (typeof window !== 'undefined' ? window : null);
  const getCanvas = config.canvas ?? (() => document.querySelector('canvas'));

  let running = false;
  let clientX = 0;
  let clientY = 0;
  let inside = false;
  let heldMask = 0;
  let pressedMask = 0;
  let releasedMask = 0;
  let wheel = 0;

  function onPointerMove(event: Event): void {
    const pointer = event as PointerEvent;
    clientX = pointer.clientX;
    clientY = pointer.clientY;
    inside = true;
  }

  function onPointerDown(event: Event): void {
    const pointer = event as PointerEvent;
    clientX = pointer.clientX;
    clientY = pointer.clientY;
    inside = true;
    const bit = maskOf(pointer.button);
    if (bit === 0) return;
    heldMask |= bit;
    pressedMask |= bit;
    // 指针事件默认会选中文本/触发拖拽，游戏画面里不需要。
    pointer.preventDefault?.();
  }

  function onPointerUp(event: Event): void {
    const pointer = event as PointerEvent;
    const bit = maskOf(pointer.button);
    if (bit === 0) return;
    heldMask &= ~bit;
    releasedMask |= bit;
  }

  function onPointerLeave(): void {
    inside = false;
    // 离开时如果还按着，视为松开，避免"按住状态永远卡住"。
    releasedMask |= heldMask;
    heldMask = 0;
  }

  function onWheel(event: Event): void {
    const wheelEvent = event as WheelEvent;
    wheel += wheelEvent.deltaY;
    // 防止滚轮把页面滚走。
    wheelEvent.preventDefault?.();
  }

  function onBlur(): void {
    releasedMask |= heldMask;
    heldMask = 0;
    inside = false;
  }

  function maskOf(button: number): number {
    switch (button) {
      case 0:
        return 1;
      case 1:
        return 2;
      case 2:
        return 4;
      default:
        return 0;
    }
  }

  return {
    id: 'pointer',
    start() {
      if (running || !target) return;
      running = true;
      const options = { passive: false } as AddEventListenerOptions;
      target.addEventListener('pointermove', onPointerMove);
      target.addEventListener('pointerdown', onPointerDown);
      target.addEventListener('pointerup', onPointerUp);
      target.addEventListener('pointerleave', onPointerLeave);
      target.addEventListener('wheel', onWheel, options);
      target.addEventListener('blur', onBlur);
    },
    stop() {
      if (!running || !target) return;
      running = false;
      target.removeEventListener('pointermove', onPointerMove);
      target.removeEventListener('pointerdown', onPointerDown);
      target.removeEventListener('pointerup', onPointerUp);
      target.removeEventListener('pointerleave', onPointerLeave);
      target.removeEventListener('wheel', onWheel);
      target.removeEventListener('blur', onBlur);
      onBlur();
    },
    drain(raw: RawInputTarget) {
      const pointer = raw.pointer;
      if (!running) {
        pointer.connected = false;
        return;
      }
      // 判定是否在画布内：画布的客户端包围盒。
      const canvas = getCanvas();
      if (canvas) {
        const rect = canvas.getBoundingClientRect();
        inside =
          clientX >= rect.left &&
          clientX <= rect.right &&
          clientY >= rect.top &&
          clientY <= rect.bottom;
      }

      pointer.connected = true;
      pointer.clientX = clientX;
      pointer.clientY = clientY;
      pointer.inside = inside;
      pointer.heldMask = heldMask;
      pointer.pressedMask = pressedMask;
      pointer.releasedMask = releasedMask;
      pointer.wheel = wheel;

      pressedMask = 0;
      releasedMask = 0;
      wheel = 0;
    },
  };
}

/** 导出给测试与汇总层复用。 */
export type { RawPointerState };
