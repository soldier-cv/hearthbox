import { defineGame, type GameContext, type GameInstance } from '@hearthbox/sdk';

/**
 * 输入夹具：验证平台承诺的三类输入**都能单独玩**。
 *
 * - 手柄 / 键盘方向键：移动方块
 * - 键盘任意键：`input.keyboard.held()`，这里用 W/A/S/D 也走同一套
 * - 鼠标：点方块换色、点空白移动方块到指针处、滚轮改大小
 *
 * 它同时是"小游戏只用鼠标点点"的参照实现：不引任何引擎，纯 ctx2d。
 */
interface State {
  x: number;
  y: number;
  color: number;
  size: number;
}

const COLORS = ['#f5a524', '#4ade80', '#60a5fa', '#f472b6'];
const SPEED = 90;
const MIN_SIZE = 8;
const MAX_SIZE = 48;

export default defineGame({
  id: 'hearthbox.inputs',

  async create(ctx: GameContext): Promise<GameInstance> {
    const saved = ctx.storage.get<State>('state');
    const state: State = {
      x: saved?.x ?? ctx.width / 2,
      y: saved?.y ?? ctx.height / 2,
      color: saved?.color ?? 0,
      size: saved?.size ?? 16,
    };

    let hits = 0;
    let pointerInsideBlock = false;

    function persist(): void {
      ctx.storage.set('state', state);
    }

    function hitTest(x: number, y: number): boolean {
      const half = state.size / 2;
      return Math.abs(x - state.x) <= half && Math.abs(y - state.y) <= half;
    }

    return {
      update(dt: number) {
        const pad = ctx.input.p1;
        const keyboard = ctx.input.keyboard;
        const pointer = ctx.input.pointer;

        // 1) 手柄 / 方向键 / WASD：连续移动
        state.x += pad.move.x * SPEED * dt;
        state.y += pad.move.y * SPEED * dt;

        // 2) 完整键位：按住 Shift 走得更快（演示 keyboard.held 的用法）
        const fast = keyboard.held('ShiftLeft') || keyboard.held('ShiftRight');
        if (fast) {
          state.x += pad.move.x * SPEED * dt;
          state.y += pad.move.y * SPEED * dt;
        }

        // 3) 鼠标：左键点方块换色，点空白把方块挪到指针处
        pointerInsideBlock = pointer.connected && hitTest(pointer.x, pointer.y);
        if (pointer.pressed('left') && pointer.inside) {
          if (pointerInsideBlock) {
            state.color = (state.color + 1) % COLORS.length;
            hits += 1;
            persist();
          } else {
            state.x = pointer.x;
            state.y = pointer.y;
            persist();
          }
        }

        // 4) 滚轮改大小
        if (pointer.connected && pointer.wheel !== 0) {
          const next = state.size - pointer.wheel * 0.05;
          state.size = Math.min(MAX_SIZE, Math.max(MIN_SIZE, next));
          persist();
        }

        // 5) 键盘直接按 A 也换色（不用手柄预设也能操作）
        if (keyboard.pressed('KeyA') && !keyboard.held('KeyD')) {
          state.color = (state.color + 1) % COLORS.length;
          persist();
        }

        const half = state.size / 2;
        state.x = Math.min(ctx.width - half, Math.max(half, state.x));
        state.y = Math.min(ctx.height - half, Math.max(half, state.y));
      },

      render() {
        const g = ctx.ctx2d;
        const pointer = ctx.input.pointer;

        g.fillStyle = '#0b0b0f';
        g.fillRect(0, 0, ctx.width, ctx.height);

        // 鼠标模式下给一块淡淡的"指针在画布内"的底，方便肉眼确认换算没歪。
        if (pointer.connected && pointer.inside) {
          g.fillStyle = '#15151d';
          g.fillRect(0, 0, ctx.width, ctx.height);
        }

        const half = state.size / 2;
        g.fillStyle = COLORS[state.color] ?? COLORS[0]!;
        g.fillRect(state.x - half, state.y - half, state.size, state.size);

        // 指针位置画个小十字：逻辑坐标是否点准了，一眼就能看出来。
        if (pointer.connected && pointer.inside) {
          g.fillStyle = pointerInsideBlock ? '#ffffff' : '#5a5a6e';
          g.fillRect(pointer.x - 0.5, pointer.y - 4, 1, 8);
          g.fillRect(pointer.x - 4, pointer.y - 0.5, 8, 1);
        }

        // 点击次数，用来确认 pressed 边沿没有重复触发。
        g.fillStyle = '#6a6a7a';
        for (let i = 0; i < hits; i += 1) {
          g.fillRect(6 + i * 5, ctx.height - 10, 3, 3);
        }
      },

      dispose() {
        persist();
      },
    };
  },
});
