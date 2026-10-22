/**
 * 金手指（cheat）与调试钩子的契约。
 *
 * 分工：
 * - **游戏声明**：每个金手指的 id、名字、说明。平台不知道也不该知道
 *   "无限命"在某个游戏里怎么实现。
 * - **平台持有**：启用状态、按游戏持久化、未来的设置页 UI、导出/导入。
 * - **游戏应用**：每帧读 `enabled(id)`，自己决定把值写到哪里。
 *
 * 为什么不做"内存地址 + 值"的通用补丁：那要求平台拥有游戏内存，
 * 在 Web 运行时里不存在这样的内存模型（游戏是普通 JS，变量在闭包里）。
 * 强行伪造一套只会得到一个既不能用、又让人误解的接口。
 * 需要真正的内存补丁时（比如接模拟器核），走另一条路：模拟器本身作为
 * 普通游戏包接入，由它实现自己的金手指（见 roadmap "以后"）。
 */

/** 一个金手指的声明。游戏在 `create` 里用 `ctx.cheats.declare()` 注册。 */
export interface CheatDefinition {
  /**
   * 稳定 id，游戏内唯一，发布后不要改（改了会让已保存的启用状态失效）。
   * 建议用 `inf-lives`、`unlock-all` 这种短横线命名。
   */
  id: string;
  /** 玩家看到的名字，如"无限命"。 */
  name: string;
  /** 一句话说明作用。设置页会显示。 */
  description?: string;
  /**
   * 默认是否启用。默认 `false`。
   *
   * 默认开启的金手指必须只影响便利性（比如"跳过开场动画"），
   * 不能影响成就或存档的正当性。
   */
  defaultEnabled?: boolean;
  /**
   * 危险等级。平台据此在 UI 上区分，并决定是否二次确认。
   * - `cosmetic`：只改外观
   * - `gameplay`（默认）：改数值、解锁内容
   * - `destructive`：可能弄坏存档（比如"清空进度"）
   */
  severity?: 'cosmetic' | 'gameplay' | 'destructive';
}

/** 游戏侧接口。 */
export interface CheatsApi {
  /** 声明一个金手指。重复 id 会抛错，避免两个功能抢同一个开关。 */
  declare(definition: CheatDefinition): void;
  /** 是否启用。每帧调用，不分配。 */
  enabled(id: string): boolean;
  /** 本帧内是否刚被玩家切换为启用（用于"改完立即生效"的一次性逻辑）。 */
  justEnabled(id: string): boolean;
  /** 全部已声明的金手指，供游戏自己画调试面板。 */
  readonly all: readonly CheatDefinition[];
}

/** 平台侧持有的状态：按游戏 id 分组，按金手指 id 存布尔值。 */
export type CheatState = Readonly<Record<string, boolean>>;

/**
 * 把游戏声明与已保存状态合并成最终开关表。
 *
 * - 已保存的状态优先（玩家改过的就是玩家改过的）
 * - 没保存过的用 `defaultEnabled`
 * - 已声明但状态里多出来的 id 被忽略（游戏删了某个金手指）
 * - 状态里存在但游戏不再声明的 id 也保留在存储里，不删：
 *   万一游戏回滚到旧版本，玩家的开关还在
 */
export function resolveCheats(
  definitions: readonly CheatDefinition[],
  saved: CheatState,
): Map<string, boolean> {
  const resolved = new Map<string, boolean>();
  for (const definition of definitions) {
    const stored = saved[definition.id];
    resolved.set(definition.id, stored === undefined ? definition.defaultEnabled === true : stored);
  }
  return resolved;
}
