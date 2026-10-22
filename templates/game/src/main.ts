import { defineGame, type GameContext, type GameInstance } from '@hearthbox/sdk';
import { CONFIG as C } from './config';
import { Round } from './round';
import { declareCheats, resolveTuning, type Tuning } from './tuning';

/**
 * 模板游戏：限时收集 + 升级。
 *
 * 它不是一个"好玩的游戏"，而是一条**完整链路**：
 * 输入 → 移动 → 碰撞 → 经验 → 升级 → 状态切换 → 存档 → 重开。
 *
 * 关键示范：**所有数值都走 `Tuning`，不直接写死**。这样金手指只需要在
 * `tuning.ts` 里包一层，游戏逻辑完全不需要知道金手指的存在。
 */

interface Target {
  x: number;
  y: number;
}

interface SaveData {
  best: number;
  level: number;
}

export default defineGame({
  id: 'me.my-game',

  async create(ctx: GameContext): Promise<GameInstance> {
    // ---- 金手指：先声明，再拿可调数值 ----
    declareCheats(ctx);
    const tuning: Tuning = resolveTuning(ctx);

    // ---- 存档 ----
    const saved = ctx.storage.get<SaveData>('progress');
    let best = saved?.best ?? 0;

    const round = new Round(C.roundSeconds, C.targetCount);

    const player = {
      x: C.width * C.player.spawnX,
      y: C.height * C.player.spawnY,
    };
    const targets: Target[] = [];

    // ---- 经验与等级 ----
    let xp = 0;
    let level = 1;
    let xpNeedNow = tuning.xpNeed(level);
    let pendingLevels = 0;

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
      xp = 0;
      level = 1;
      pendingLevels = 0;
      // 重开时重新取门槛：玩家可能在设置里调了经验倍率。
      xpNeedNow = tuning.xpNeed(level);
      spawnTargets();
    }

    spawnTargets();

    /** 吃到一个目标：给经验，够了就升级。 */
    function gainXp(amount: number): void {
      xp += amount;
      while (xp >= xpNeedNow) {
        xp -= xpNeedNow;
        level += 1;
        pendingLevels += 1;
        xpNeedNow = tuning.xpNeed(level);
      }
    }

    function update(dt: number): void {
      if (!round.isPlaying) {
        if (ctx.input.p1.pressed('south') || ctx.input.keyboard.pressed('Space')) {
          reset();
        }
        return;
      }

      // 速度经 tuning：金手指把 moveSpeed 调到 2 倍时这里自动生效。
      const speed = tuning.moveSpeed(C.player.speed);
      const move = ctx.input.p1.move;
      player.x += move.x * speed * dt;
      player.y += move.y * speed * dt;

      const half = C.player.size / 2;
      player.x = Math.min(C.width - half, Math.max(half, player.x));
      player.y = Math.min(C.height - half, Math.max(half, player.y));

      // 升级选项：等玩家按 A 消费。这里只演示"有待选就暂停"。
      if (pendingLevels > 0) {
        if (ctx.input.p1.pressed('south') || ctx.input.keyboard.pressed('Space')) {
          pendingLevels -= 1;
        }
        return;
      }

      for (let i = targets.length - 1; i >= 0; i -= 1) {
        const target = targets[i]!;
        if (Math.abs(player.x - target.x) > half || Math.abs(player.y - target.y) > half) continue;

        targets.splice(i, 1);
        gainXp(C.xpPerTarget);

        const won = round.collect();
        if (won) {
          best = Math.max(best, round.remaining);
          const data: SaveData = { best, level };
          ctx.storage.set('progress', data);
        }
      }

      round.update(dt);
    }

    function render(): void {
      const g = ctx.ctx2d;

      g.fillStyle = C.colors.background;
      g.fillRect(0, 0, C.width, C.height);

      g.fillStyle = C.colors.grid;
      for (let x = 16; x < C.width; x += 16) g.fillRect(x, 0, 1, C.height);
      for (let y = 16; y < C.height; y += 16) g.fillRect(0, y, C.width, 1);

      g.fillStyle = C.colors.target;
      for (const target of targets) g.fillRect(target.x - 2, target.y - 2, 4, 4);

      const half = C.player.size / 2;
      // 无敌时描一圈白边，让金手指的效果看得见。
      if (ctx.cheats.enabled('god-mode')) {
        g.strokeStyle = C.colors.text;
        g.lineWidth = 1;
        g.strokeRect(
          player.x - half - 2,
          player.y - half - 2,
          C.player.size + 4,
          C.player.size + 4,
        );
      }
      g.fillStyle = C.colors.player;
      g.fillRect(player.x - half, player.y - half, C.player.size, C.player.size);

      // HUD
      g.fillStyle = C.colors.text;
      g.font = '8px monospace';
      g.fillText(`${round.collected}/${C.targetCount}`, 4, 10);
      g.fillText(`Lv${level}`, 4, 20);
      g.fillText(`${round.remaining}s`, C.width - 26, 10);

      // 经验条
      const barWidth = 60;
      g.fillStyle = C.colors.grid;
      g.fillRect(4, 24, barWidth, 2);
      g.fillStyle = C.colors.target;
      g.fillRect(4, 24, Math.min(barWidth, (xp / xpNeedNow) * barWidth), 2);

      if (best > 0) {
        g.fillStyle = C.colors.dim;
        g.fillText(`best ${best}s`, 4, C.height - 4);
      }

      // 升级待选
      if (pendingLevels > 0 && round.isPlaying) {
        g.fillStyle = 'rgba(11, 11, 15, 0.7)';
        g.fillRect(0, C.height / 2 - 16, C.width, 32);
        g.fillStyle = C.colors.player;
        g.font = '10px monospace';
        const text = `LEVEL UP ×${pendingLevels}`;
        g.fillText(text, (C.width - g.measureText(text).width) / 2, C.height / 2 - 2);
        g.fillStyle = C.colors.dim;
        g.font = '8px monospace';
        const hint = 'press A / Space';
        g.fillText(hint, (C.width - g.measureText(hint).width) / 2, C.height / 2 + 9);
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
