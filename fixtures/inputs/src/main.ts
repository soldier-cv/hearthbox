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
    // 真实加载一张图片素材：验证 ctx.assets.image() 这条链路，
    // 而不只是"代码写了但从来没跑过"。加载失败会直接抛进崩溃页。
    const tile = await ctx.assets.image('tile.png');

    const saved = ctx.storage.get<State>('state');
    const state: State = {
      x: saved?.x ?? ctx.width / 2,
      y: saved?.y ?? ctx.height / 2,
      color: saved?.color ?? 0,
      size: saved?.size ?? 16,
    };

    // 声明两个金手指。平台持有开关，玩家在设置页（M3）里切。
    // 这里用它们验证"口子通了"，不是真的作弊功能。
    ctx.cheats.declare({
      id: 'giant-cursor',
      name: '巨大的准星',
      description: '把鼠标准星放大 4 倍，方便看清逻辑坐标换算。',
      severity: 'cosmetic',
    });
    ctx.cheats.declare({
      id: 'unlock-all-colors',
      name: '解锁全部颜色',
      description: '允许通过滚轮以外的方式循环所有颜色。',
      severity: 'gameplay',
    });

    // 数值型金手指：移动速度倍率。演示"带范围的可调参数"。
    ctx.cheats.declare({
      id: 'move-speed',
      name: '移动速度',
      description: '方块移动速度倍率。',
      kind: 'number',
      min: 1,
      max: 3,
      step: 0.25,
      defaultValue: 1,
      unit: '×',
    });

    /** 当前生效的速度倍率。走金手指的数值型接口，已夹在范围内。 */
    const speedScale = (): number => {
      const value = ctx.options.value('move-speed');
      return typeof value === 'number' ? value : 1;
    };

    // ---- 演示另外两个 scope：设置与只读状态 ----
    // 它们和金手指用同一套声明 API，只是进不同面板。
    ctx.options.declare({
      id: 'cursor-style',
      name: '指针样式',
      description: '选择画布内指针的绘制方式。',
      kind: 'choice',
      scope: 'setting',
      defaultValue: 'cross',
      choices: [
        { value: 'cross', label: '十字' },
        { value: 'dot', label: '圆点' },
        { value: 'none', label: '不显示' },
      ],
    });

    ctx.options.declare({
      id: 'clicks',
      name: '累计点击',
      description: '本次存档内点中方块的次数。',
      scope: 'status',
    });

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
        // 速度经金手指的数值型接口，2× 时这里自动生效。
        const speed = SPEED * speedScale();
        state.x += pad.move.x * speed * dt;
        state.y += pad.move.y * speed * dt;

        // 2) 完整键位：按住 Shift 走得更快（演示 keyboard.held 的用法）
        const fast = keyboard.held('ShiftLeft') || keyboard.held('ShiftRight');
        if (fast) {
          state.x += pad.move.x * speed * dt;
          state.y += pad.move.y * speed * dt;
        }

        // 3) 鼠标：左键点方块换色，点空白把方块挪到指针处
        pointerInsideBlock = pointer.connected && hitTest(pointer.x, pointer.y);
        if (pointer.pressed('left') && pointer.inside) {
          if (pointerInsideBlock) {
            state.color = (state.color + 1) % COLORS.length;
            hits += 1;
            // 写进 status 面板，玩家在"成就"里能看到累计次数。
            ctx.storage.set('hits', hits);
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

        // 金手指：只有开启时才循环全部颜色（默认关，玩家在设置里打开）
        if (ctx.cheats.enabled('unlock-all-colors') && keyboard.pressed('KeyC')) {
          state.color = (state.color + 1) % COLORS.length;
          persist();
        }

        // 用平台随机数（可复现）而不是 Math.random：同一 debug.seed 下
        // 按 R 落点完全一致，方便排查"只在特定帧出现"的问题。
        if (keyboard.pressed('KeyR')) {
          state.x = ctx.random.float(0, ctx.width);
          state.y = ctx.random.float(0, ctx.height);
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
          // 设置项：玩家可以在"设置"面板里改成圆点或不显示。
          const style = ctx.options.choice('cursor-style');
          if (style !== 'none') {
            // 金手指：准星放大到 4 倍，用来验证作弊开关真的到了游戏手里。
            const arm = ctx.cheats.enabled('giant-cursor') ? 16 : 4;
            const thickness = ctx.cheats.enabled('giant-cursor') ? 3 : 1;
            g.fillStyle = pointerInsideBlock ? '#ffffff' : '#5a5a6e';
            if (style === 'dot') {
              g.fillRect(pointer.x - 2, pointer.y - 2, 4, 4);
            } else {
              g.fillRect(pointer.x - thickness / 2, pointer.y - arm, thickness, arm * 2);
              g.fillRect(pointer.x - arm, pointer.y - thickness / 2, arm * 2, thickness);
            }
          }
        }

        // 点击次数，用来确认 pressed 边沿没有重复触发。
        g.fillStyle = '#6a6a7a';
        for (let i = 0; i < hits; i += 1) {
          g.fillRect(6 + i * 5, ctx.height - 10, 3, 3);
        }

        // 用加载好的素材在右上角铺一块 16×16 的棋盘，证明 assets 链路是通的。
        // 素材刻意做成低饱和灰：测试靠"饱和色"扫描方块，素材不该干扰它。
        g.drawImage(tile, ctx.width - 20, 4, 16, 16);
      },

      dispose() {
        persist();
      },
    };
  },
});
