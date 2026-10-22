import { defineGame, type GameContext, type GameInstance } from '@hearthbox/sdk';

/**
 * 契约夹具：验证平台该保证的四件事。
 * 1. 逻辑分辨率坐标系（320×180），平台负责缩放到物理屏幕
 * 2. 手柄 / 键盘输入归一化后是同一个 PadState
 * 3. 固定 60Hz 的 update + 插值 render
 * 4. 存档同步可读、异步落盘，刷新后还在
 */
interface State {
  x: number;
  y: number;
  color: number;
}

const COLORS = ['#f5a524', '#4ade80', '#60a5fa', '#f472b6'];
const SIZE = 12;
const SPEED = 90; // 逻辑像素 / 秒

export default defineGame({
  id: 'hearthbox.contract',

  async create(ctx: GameContext): Promise<GameInstance> {
    const saved = ctx.storage.get<State>('state');
    const state: State = {
      x: saved?.x ?? ctx.width / 2,
      y: saved?.y ?? ctx.height / 2,
      color: saved?.color ?? 0,
    };

    let elapsed = 0;

    return {
      update(dt: number) {
        const pad = ctx.input.p1;
        state.x += pad.move.x * SPEED * dt;
        state.y += pad.move.y * SPEED * dt;

        // 夹在画面内，避免存档把方块存到外面再也找不着。
        const half = SIZE / 2;
        state.x = Math.min(ctx.width - half, Math.max(half, state.x));
        state.y = Math.min(ctx.height - half, Math.max(half, state.y));

        if (pad.pressed('south')) {
          state.color = (state.color + 1) % COLORS.length;
          // 关键状态立即写：Android 可能直接杀进程。
          ctx.storage.set('state', state);
        }

        elapsed += dt;
      },

      render(alpha: number) {
        const g = ctx.ctx2d;
        // 背景色随帧轻微变化，用来肉眼确认循环在跑。
        g.fillStyle = '#0b0b0f';
        g.fillRect(0, 0, ctx.width, ctx.height);

        // alpha 让位置插值到渲染帧，60Hz 逻辑在 50/120Hz 屏上依然平滑。
        const drawX = state.x + ctx.input.p1.move.x * SPEED * alpha * (1 / 60);
        const drawY = state.y + ctx.input.p1.move.y * SPEED * alpha * (1 / 60);

        g.fillStyle = COLORS[state.color] ?? COLORS[0]!;
        g.fillRect(drawX - SIZE / 2, drawY - SIZE / 2, SIZE, SIZE);

        // 一个不会动的参考点：用来区分"画面在动"和"整张画布在缩放"。
        g.fillStyle = '#2a2a36';
        g.fillRect(8, 8, 4, 4);

        g.fillStyle = elapsed % 1 < 0.5 ? '#f2f2f5' : '#9a9aa8';
        g.fillRect(8, ctx.height - 12, 4, 4);
      },

      dispose() {
        // 这里刻意什么都不做：存档已经在 set 时落盘。
        // 如果只在 dispose 里写，进程被杀时就丢了。
      },
    };
  },
});
