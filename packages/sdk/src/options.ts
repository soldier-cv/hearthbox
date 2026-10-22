/**
 * 可调项的声明模型。
 *
 * 这个文件是整个"扩展性"的支点。核心判断：
 *
 * **金手指、游戏设置、成就是同一件事** —— 游戏声明一个可调项，
 * 平台按类型渲染控件、按归属放进不同面板、按 id 持久化。
 *
 * 所以不设计三套 API，只设计一套，用 `scope` 区分入口。
 * 加一种新面板不需要动平台代码。
 */

/** 控件类型。决定平台渲染成什么。 */
export type OptionKind =
  /** 开关：复选框。 */
  | 'boolean'
  /** 有范围的数值：滑杆。 */
  | 'number'
  /** 固定选项：下拉或分段按钮。 */
  | 'choice';

/** 归属面板。决定它出现在哪儿、谁能改。 */
export type OptionScope =
  /** 金手指：玩家想用就用，默认全关或全默认。 */
  | 'cheat'
  /** 游戏设置：音量、难度、键位这类正常配置。 */
  | 'setting'
  /** 只读展示：成就、统计。玩家不能改，只能看。 */
  | 'status';

/** 所有可调项的公共字段。 */
export interface OptionBase {
  /** 稳定 id，游戏内唯一，发布后不要改。改了玩家设置失效。 */
  id: string;
  /** 玩家看到的名字。 */
  name: string;
  /** 一句话说明，面板上显示。 */
  description?: string;
  /** 归属面板，缺省 `cheat`。 */
  scope?: OptionScope;
}

export interface BooleanOption extends OptionBase {
  kind?: 'boolean';
  /** 默认是否启用，缺省 false。 */
  defaultEnabled?: boolean;
  /**
   * 危险等级，只对 `scope: 'cheat'` 有意义。
   * - `cosmetic`：只改外观
   * - `gameplay`（缺省）：改数值、解锁内容
   * - `destructive`：可能弄坏存档
   */
  severity?: 'cosmetic' | 'gameplay' | 'destructive';
}

export interface NumberOption extends OptionBase {
  kind: 'number';
  /** 最小值。玩家不能调到更低。 */
  min: number;
  /** 最大值。 */
  max: number;
  /** 步进，决定 UI 每次加减多少。 */
  step: number;
  /** 默认值，须落在 [min, max] 内且符合 step。 */
  defaultValue: number;
  /** 单位，仅用于显示，如 '×'、'%'、's'。 */
  unit?: string;
  severity?: 'cosmetic' | 'gameplay' | 'destructive';
}

export interface ChoiceOption extends OptionBase {
  kind: 'choice';
  /** 可选值。至少两项。 */
  choices: ReadonlyArray<{ value: string; label: string }>;
  /** 默认选中项的 value。 */
  defaultValue: string;
  severity?: 'cosmetic' | 'gameplay' | 'destructive';
}

export type OptionDefinition = BooleanOption | NumberOption | ChoiceOption;

/** 值的联合类型，取决于 kind。 */
export type OptionValue = boolean | number | string;

/** 声明接口。游戏在 create() 里调用。 */
export interface OptionsApi {
  /** 声明一个可调项。重复 id 抛错；数值范围非法也抛错。 */
  declare(definition: OptionDefinition): void;
  /** 读当前值。读未声明的 id 返回 undefined。 */
  value(id: string): OptionValue | undefined;
  /** 便利方法：布尔型读成 boolean。 */
  enabled(id: string): boolean;
  /** 便利方法：数值型读成 number；非数值型返回 0。 */
  number(id: string): number;
  /** 便利方法：枚举型读成 string；非枚举型返回空串。 */
  choice(id: string): string;
  /** 本帧内刚被切换为启用（仅布尔/数值型有意义）。 */
  justEnabled(id: string): boolean;
  /** 全部已声明项。 */
  readonly all: readonly OptionDefinition[];
  /** 只看某个面板的项。 */
  byScope(scope: OptionScope): readonly OptionDefinition[];
}
