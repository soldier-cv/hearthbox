import type { CheatDefinition, GameContext } from '@hearthbox/sdk';

/**
 * 调参表：所有会被人为调整的数值走同一个入口。
 *
 * 为什么要这层：金手指、难度、调试都要改数值。如果数值散在 `update` 里
 * （`this.speed * 1.5`），每个金手指都要去翻代码。集中到一个对象之后，
 * 金手指只需要在这里包一层。
 *
 * 规则见 docs/tuning.md：**游戏逻辑里不允许出现裸数值**。
 */

/** 一个可调项：给定基础值，返回被调整后的值。 */
export interface Tuning {
  /** 玩家移动速度，逻辑像素/秒。 */
  moveSpeed: (base: number) => number;
  /** 升级所需经验。传入关卡等级。 */
  xpNeed: (level: number) => number;
  /** 敌人血量倍率。传入游戏时间（秒）。 */
  enemyHp: (base: number) => number;
  /** 出怪速率。传入基础速率。 */
  spawnRate: (base: number) => number;
  /** 升级选项的品质权重。1 为原版，>1 更容易出好选项。 */
  offerQuality: (base: number) => number;
}

/** 未经任何调整的原版数值。 */
export const baseline: Tuning = {
  moveSpeed: (base) => base,
  xpNeed: (level) => Math.round(10 + level * 7 + Math.pow(level, 1.4)),
  enemyHp: (base) => base,
  spawnRate: (base) => base,
  offerQuality: (base) => base,
};

/**
 * 声明这个游戏的全部金手指。
 *
 * 单独成一个函数，因为它是"契约的一部分"——发布后 id 不能改。
 * 数值型金手指都给了范围，平台据此生成 UI 并夹取越界值。
 */
export function declareCheats(ctx: GameContext): void {
  // 金手指：玩家想用就开，默认全是原版数值。
  ctx.cheats.declare({
    id: 'move-speed',
    name: '移动速度',
    description: '玩家移动速度倍率。',
    kind: 'number',
    min: 1,
    max: 3,
    step: 0.25,
    defaultValue: 1,
    unit: '×',
  });

  ctx.cheats.declare({
    id: 'xp-rate',
    name: '经验倍率',
    description: '每个经验球给的经验倍率。',
    kind: 'number',
    min: 1,
    max: 5,
    step: 0.5,
    defaultValue: 1,
    unit: '×',
  });

  ctx.cheats.declare({
    id: 'spawn-rate',
    name: '出怪速度',
    description: '越小出怪越慢。0.2 表示只有原版的五分之一。',
    kind: 'number',
    min: 0.2,
    max: 2,
    step: 0.1,
    defaultValue: 1,
    unit: '×',
  });

  ctx.cheats.declare({
    id: 'offer-quality',
    name: '升级品质',
    description: '提高稀有权重，更容易出现强力选项。',
    kind: 'number',
    min: 1,
    max: 4,
    step: 0.5,
    defaultValue: 1,
    unit: '×',
  });

  // 设置项与金手指用同一套 declare，只是 scope 不同。
  ctx.options.declare({
    id: 'shake',
    name: '屏幕震动',
    kind: 'choice',
    scope: 'setting',
    defaultValue: 'on',
    choices: [
      { value: 'on', label: '开' },
      { value: 'off', label: '关' },
    ],
  });

  ctx.cheats.declare({
    id: 'god-mode',
    name: '无敌',
    description: '不受伤害。',
    severity: 'destructive',
  });
}

/**
 * 把金手指接到 baseline 上。
 *
 * 只有这里知道"哪个金手指改哪个数值"。游戏逻辑只认 Tuning 接口，
 * 完全不知道金手指的存在 —— 这是分层的关键。
 */
export function tunedCheats(ctx: GameContext): Tuning {
  const cheats = ctx.cheats;
  return {
    moveSpeed: (base) => baseline.moveSpeed(base) * cheats.value('move-speed'),
    xpNeed: (level) => baseline.xpNeed(level) / cheats.value('xp-rate'),
    enemyHp: (base) => baseline.enemyHp(base),
    spawnRate: (base) => baseline.spawnRate(base) * cheats.value('spawn-rate'),
    offerQuality: (base) => baseline.offerQuality(base) * cheats.value('offer-quality'),
  };
}

/** 当前该用哪套数值。没有金手指时就是 baseline。 */
export function resolveTuning(ctx: GameContext): Tuning {
  return tunedCheats(ctx);
}

/** 供测试与文档引用：全部可调项的名字。 */
export const TUNING_KEYS: readonly (keyof Tuning)[] = [
  'moveSpeed',
  'xpNeed',
  'enemyHp',
  'spawnRate',
  'offerQuality',
];

/** 把定义集中导出，便于 `hbx` 校验 id 稳定性。 */
export const CHEAT_IDS: readonly string[] = [
  'move-speed',
  'xp-rate',
  'spawn-rate',
  'offer-quality',
  'god-mode',
];

export type { CheatDefinition };
