import { defineGame, type GameContext, type GameInstance } from '@hearthbox/sdk';

/**
 * 演示游戏：把平台提供的每一项能力都用一遍。
 *
 * 它的用途是**验证平台是否正常**，不是给人玩的游戏。所以刻意做得简单，
 * 但每条能力都必须看得见：
 *
 * - 移动：手柄摇杆 / 十字键 / 键盘方向键 / WASD 都能走
 * - 鼠标：点方块换色、点空白把方块搬过去、滚轮改大小
 * - 存档：位置、颜色、大小、点击次数，刷新后都还在
 * - 金手指：移动速度（可调数值）、巨大准星（开关）、解锁全部颜色（开关）
 * - 设置：指针样式（十字 / 圆点 / 不显示）
 * - 成就：累计点击次数（只读）
 * - 素材：右上角一张 16×16 图片，证明 ctx.assets 是通的
 * - 随机：按 R 随机传送，同一 debug.seed 下落点可复现
 */
interface State {
  x: number;
  y: number;
  color: number;
  size: number;
  hits: number;
}

const COLORS = ['#f5a524', '#4ade80', '#60a5fa', '#f472b6'];
const SPEED = 90;
const MIN_SIZE = 8;
const MAX_SIZE = 48;

export default defineGame({
  id: 'hearthbox.demo',

  async create(ctx: GameContext): Promise<GameInstance> {
    // 真加载一张图片：证明素材链路是通的，加载失败会直接进崩溃页。
    const tile = await ctx.assets.image('tile.png');

    const saved = ctx.storage.get<State>('state');
    const state: State = {
      x: saved?.x ?? ctx.width / 2,
      y: saved?.y ?? ctx.height / 2,
      color: saved?.color ?? 0,
      size: saved?.size ?? 16,
      hits: saved?.hits ?? 0,
    };

    // ---- 金手指：玩家想用就开，默认都是原版 ----
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

    ctx.cheats.declare({
      id: 'giant-cursor',
      name: '巨大的准星',
      description: '把鼠标准星放大 4 倍，方便看清位置。',
      severity: 'cosmetic',
    });

    ctx.cheats.declare({
      id: 'unlock-all-colors',
      name: '解锁全部颜色',
      description: '按 C 也能换色，不必点方块。',
      severity: 'gameplay',
    });

    // ---- 设置：和上面是同一套声明，只是进不同面板 ----
    ctx.options.declare({
      id: 'cursor-style',
      name: '指针样式',
      description: '画布内鼠标指针的显示方式。',
      kind: 'choice',
      scope: 'setting',
      defaultValue: 'cross',
      choices: [
        { value: 'cross', label: '十字' },
        { value: 'dot', label: '圆点' },
        { value: 'none', label: '不显示' },
      ],
    });

    // ---- 成就：只读，玩家看得到但改不了 ----
    ctx.options.declare({
      id: 'clicks',
      name: '累计点击',
      description: '点中方块的次数，会一直累计。',
      scope: 'status',
    });

    let pointerOnBlock = false;

    function persist(): void {
      ctx.storage.set('state', state);
    }

    function hitTest(x: number, y: number): boolean {
      const half = state.size / 2;
      return Math.abs(x - state.x) <= half && Math.abs(y - state.y) <= half;
    }

    /** 换一个颜色，并记录点击。 */
    function nextColor(): void {
      state.color = (state.color + 1) % COLORS.length;
      state.hits += 1;
      persist();
    }

    return {
      update(dt: number) {
        const pad = ctx.input.p1;
        const keyboard = ctx.input.keyboard;
        const pointer = ctx.input.pointer;

        // 1) 手柄 / 方向键 / WASD 移动。速度倍率来自金手指。
        const speed = SPEED * ctx.options.number('move-speed');
        state.x += pad.move.x * speed * dt;
        state.y += pad.move.y * speed * dt;

        // 2) 按住 Shift 走得更快（演示完整键位查询）
        if (keyboard.held('ShiftLeft') || keyboard.held('ShiftRight')) {
          state.x += pad.move.x * speed * dt;
          state.y += pad.move.y * speed * dt;
        }

        // 3) 鼠标：点方块换色，点空白把方块搬过去
        pointerOnBlock = pointer.connected && hitTest(pointer.x, pointer.y);
        if (pointer.pressed('left') && pointer.inside) {
          if (pointerOnBlock) {
            nextColor();
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

        // 5) 键盘 A 换色（不用鼠标也能操作）
        if (keyboard.pressed('KeyA') && !keyboard.held('KeyD')) {
          nextColor();
        }

        // 6) 金手指开了"解锁全部颜色"时，C 也能换色
        if (ctx.cheats.enabled('unlock-all-colors') && keyboard.pressed('KeyC')) {
          nextColor();
        }

        // 7) 按 R 随机传送。用 ctx.random 才能靠 debug.seed 复现。
        if (keyboard.pressed('KeyR')) {
          state.x = ctx.random.float(0, ctx.width);
          state.y = ctx.random.float(0, ctx.height);
          persist();
        }

        // 夹在画面内
        const half = state.size / 2;
        state.x = Math.min(ctx.width - half, Math.max(half, state.x));
        state.y = Math.min(ctx.height - half, Math.max(half, state.y));
      },

      render() {
        const g = ctx.ctx2d;
        const pointer = ctx.input.pointer;

        g.fillStyle = '#0b0b0f';
        g.fillRect(0, 0, ctx.width, ctx.height);

        // 鼠标在画布内时给一层淡淡的底，方便肉眼确认坐标换算没歪。
        if (pointer.connected && pointer.inside) {
          g.fillStyle = '#15151d';
          g.fillRect(0, 0, ctx.width, ctx.height);
        }

        // 方块
        const half = state.size / 2;
        g.fillStyle = COLORS[state.color] ?? COLORS[0]!;
        g.fillRect(state.x - half, state.y - half, state.size, state.size);

        // 准星。样式来自设置项，大小来自金手指。
        if (pointer.connected && pointer.inside) {
          const style = ctx.options.choice('cursor-style');
          if (style !== 'none') {
            const big = ctx.cheats.enabled('giant-cursor');
            const arm = big ? 16 : 4;
            const thickness = big ? 3 : 1;
            g.fillStyle = pointerOnBlock ? '#ffffff' : '#5a5a6e';
            if (style === 'dot') {
              g.fillRect(pointer.x - 2, pointer.y - 2, 4, 4);
            } else {
              g.fillRect(pointer.x - thickness / 2, pointer.y - arm, thickness, arm * 2);
              g.fillRect(pointer.x - arm, pointer.y - thickness / 2, arm * 2, thickness);
            }
          }
        }

        // 左下角用人话说清操作，免得回头看代码才知道怎么玩。
        g.fillStyle = '#6a6a7a';
        g.font = '8px monospace';
        g.fillText('WASD/方向=移动  A=换色  R=随机  Shift=加速', 4, ctx.height - 4);

        // 右上角放加载好的图片，证明素材链路是通的。
        g.drawImage(tile, ctx.width - 20, 4, 16, 16);

        // 点击次数：画成小方块，也写进成就面板。
        g.fillStyle = '#4ade80';
        g.fillText(`clicks ${state.hits}`, 4, 10);
      },

      dispose() {
        persist();
      },
    };
  },
});
