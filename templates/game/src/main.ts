import { defineGame, type GameContext, type GameInstance } from '@hearthbox/sdk';
import { CONFIG as C } from './config';
import { Round } from './round';

/**
 * 模板游戏：限时收集。
 *
 * 它不是一个"好玩的游戏"，而是一条**完整链路**：
 * 输入 → 移动 → 碰撞 → 状态切换 → 存档 → 重开。
 * 把这条链路跑通之后，再往里填你自己玩法的肉。
 *
 * 照着 docs/pitch.md 改：核心动词决定你留着哪部分、改掉哪部分。
 */

interface Target {
  x: number;
  y: number;
}

interface SaveData {
  best: number;
}

export default defineGame({
  id: 'me.my-game',

  async create(ctx: GameContext): Promise<GameInstance> {
    // ---- 存档：平台默认支持，不调就是没有存档 ----
    const saved = ctx.storage.get<SaveData>('progress');
    let best = saved?.best ?? 0;

    const round = new Round(C.roundSeconds, C.targetCount);

    // ---- 玩家与目标 ----
    const player = {
      x: C.width * C.player.spawnX,
      y: C.height * C.player.spawnY,
    };
    const targets: Target[] = [];

    /** 用平台随机数，这样 ?debug=1&seed=42 能复现同一局。 */
    function spawnTargets(): void {
      targets.length = 0;
      for (let i = 0; i < C.targetCount; i += 1) {
        targets.push({
          x: ctx.random.float(C.player.size, C.width - C.player.size),
          y: ctx.random.float(C.player.size, C.height - C.player.size),
        });
      }
    }

    function reset(): void {
      round.reset();
      player.x = C.width * C.player.spawnX;
      player.y = C.height * C.player.spawnY;
      spawnTargets();
    }

    spawnTargets();

    // ---- 每帧逻辑 ----
    function update(dt: number): void {
      // 非游玩状态只接受"重开"，其他输入一律忽略。
      // 这是状态机的价值：死了还能动、赢了还能吃，都是这里没挡。
      if (!round.isPlaying) {
        if (ctx.input.p1.pressed('south') || ctx.input.keyboard.pressed('Space')) {
          reset();
        }
        return;
      }

      // 移动：p1.move 已经合成了摇杆与方向键，长度 ≤ 1
      const move = ctx.input.p1.move;
      player.x += move.x * C.player.speed * dt;
      player.y += move.y * C.player.speed * dt;

      // 夹在画面内
      const half = C.player.size / 2;
      player.x = Math.min(C.width - half, Math.max(half, player.x));
      player.y = Math.min(C.height - half, Math.max(half, player.y));

      // 碰撞：AABB。玩家是正方形，目标是点，简化为距离判定。
      for (let i = targets.length - 1; i >= 0; i -= 1) {
        const target = targets[i]!;
        if (Math.abs(player.x - target.x) > half || Math.abs(player.y - target.y) > half) continue;

        targets.splice(i, 1);
        const won = round.collect();
        if (won) {
          best = Math.max(best, round.remaining);
          // 关键进度立刻写，不要攒到结束 —— Android 可能直接杀进程。
          const data: SaveData = { best };
          ctx.storage.set('progress', data);
        }
      }

      if (round.update(dt)) {
        // 超时了。最佳成绩不写：输了不给记录。
      }
    }

    // ---- 每帧绘制 ----
    function render(): void {
      const g = ctx.ctx2d;

      g.fillStyle = C.colors.background;
      g.fillRect(0, 0, C.width, C.height);

      // 16px 网格背景：让"逻辑像素"这件事可见，也方便对位。
      g.fillStyle = C.colors.grid;
      for (let x = 16; x < C.width; x += 16) g.fillRect(x, 0, 1, C.height);
      for (let y = 16; y < C.height; y += 16) g.fillRect(0, y, C.width, 1);

      // 目标
      g.fillStyle = C.colors.target;
      for (const target of targets) {
        g.fillRect(target.x - 2, target.y - 2, 4, 4);
      }

      // 玩家
      const half = C.player.size / 2;
      g.fillStyle = C.colors.player;
      g.fillRect(player.x - half, player.y - half, C.player.size, C.player.size);

      // HUD
      g.fillStyle = C.colors.text;
      g.font = '8px monospace';
      g.fillText(`${round.collected}/${C.targetCount}`, 4, 10);
      g.fillText(`${round.remaining}s`, C.width - 26, 10);

      if (best > 0) {
        g.fillStyle = C.colors.dim;
        g.fillText(`best ${best}s`, 4, C.height - 4);
      }

      // 结束画面
      if (!round.isPlaying) {
        g.fillStyle = 'rgba(11, 11, 15, 0.82)';
        g.fillRect(0, 0, C.width, C.height);

        g.fillStyle = round.phase === 'won' ? C.colors.target : C.colors.danger;
        g.font = '16px monospace';
        const title = round.phase === 'won' ? 'You Win' : 'Time Up';
        g.fillText(title, (C.width - g.measureText(title).width) / 2, C.height / 2 - 6);

        g.fillStyle = C.colors.dim;
        g.font = '8px monospace';
        const hint = 'press A / Space';
        g.fillText(hint, (C.width - g.measureText(hint).width) / 2, C.height / 2 + 10);
      }
    }

    return {
      update(dt: number) {
        update(dt);
      },
      render() {
        render();
      },
    };
  },
});
