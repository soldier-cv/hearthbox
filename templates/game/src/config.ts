/**
 * 所有数值集中在这里。
 *
 * 规则：代码里不出现 magic number。改手感只改这个文件，不改逻辑。
 * 每一行都要能从 docs/systems.md 找到对应的说明。
 */
export const CONFIG = {
  /** 逻辑分辨率，必须与 game.json 的 display 一致。 */
  width: 320,
  height: 180,

  player: {
    /** 移动速度，逻辑像素/秒。 */
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
