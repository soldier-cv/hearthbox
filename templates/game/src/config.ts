/**
 * 所有常量集中在这里。
 *
 * 规则：代码里不出现 magic number。改手感只改这个文件，不改逻辑。
 *
 * 与 `tuning.ts` 的分工：
 * - `config.ts` 是**常量**（分辨率、颜色、体积），运行中不变
 * - `tuning.ts` 是**可调量**（速度、经验、出怪），会被金手指或难度改
 */
export const CONFIG = {
  /** 逻辑分辨率，必须与 game.json 的 display 一致。 */
  width: 320,
  height: 180,

  player: {
    /** 基础移动速度，逻辑像素/秒。实际值经 tuning.moveSpeed 调整。 */
    speed: 90,
    /** 体积，正方形。 */
    size: 10,
    /** 出生位置（占画面比例）。 */
    spawnX: 0.5,
    spawnY: 0.5,
  },

  /** 每局时长上限，秒。超时算失败。 */
  roundSeconds: 30,

  /** 目标数量，全部收集即胜利。 */
  targetCount: 5,

  /** 每个目标给多少经验。升级门槛由 tuning.xpNeed 决定。 */
  xpPerTarget: 4,

  colors: {
    background: '#0b0b0f',
    grid: '#1a1a24',
    player: '#f5a524',
    target: '#4ade80',
    danger: '#f472b6',
    text: '#d0d0d8',
    dim: '#6a6a7a',
  },
} as const;
