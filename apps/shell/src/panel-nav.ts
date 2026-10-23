import type { OptionDefinition } from '@hearthbox/sdk';
import type { Session } from '@hearthbox/runtime';

/**
 * 可调项面板的键盘/手柄操作。
 *
 * 面板本身仍是普通 DOM（鼠标点、读屏都能用）。这里只补一条电视路径：
 * 上下选行，A 切换/确认，左右改数值，B 关闭。
 *
 * 独立成模块是因为它要能被单元测试，而且面板渲染与输入节奏必须分开：
 * 面板打开时游戏已暂停，输入边沿不能被游戏循环偷走。
 */

export type PanelChange = 'increase' | 'decrease' | 'toggle' | 'choose-next' | 'choose-prev' | null;

/** 只读项不能改，但仍可被选中，方便玩家看数值。 */
export function isReadOnly(definition: OptionDefinition): boolean {
  return (definition.scope ?? 'cheat') === 'status';
}

/** 缺省 `kind` 按 boolean 处理（SDK 的 BooleanOption.kind 是可选的）。 */
export function kindOf(definition: OptionDefinition): 'boolean' | 'number' | 'choice' {
  return definition.kind ?? 'boolean';
}

/** 一行在按键操作下的行为。返回 null 表示这个方向对它没有意义。 */
export function actionFor(
  definition: OptionDefinition,
  direction: 'left' | 'right' | 'accept',
): PanelChange {
  if (isReadOnly(definition)) return null;
  const kind = kindOf(definition);
  if (kind === 'boolean') {
    if (direction === 'accept') return 'toggle';
    return null;
  }
  if (kind === 'number') {
    if (direction === 'left') return 'decrease';
    if (direction === 'right') return 'increase';
    return null;
  }
  if (direction === 'left') return 'choose-prev';
  if (direction === 'right') return 'choose-next';
  return 'choose-next';
}

/** 把一次选择动作落到会话上。UI 侧只关心"值变了"，不关心怎么存。 */
export function applyChange(
  session: Session,
  definition: OptionDefinition,
  change: PanelChange,
): void {
  if (!change || isReadOnly(definition)) return;
  const current = session.getOption(definition.id);
  const kind = kindOf(definition);

  if (kind === 'boolean') {
    if (change === 'toggle') session.setOption(definition.id, current !== true);
    return;
  }

  if (kind === 'number') {
    const number = definition as Extract<OptionDefinition, { kind: 'number' }>;
    const value = typeof current === 'number' ? current : number.defaultValue;
    const delta = change === 'decrease' ? -number.step : number.step;
    const next = Math.min(number.max, Math.max(number.min, value + delta));
    session.setOption(definition.id, next);
    return;
  }

  if (kind !== 'choice') return;
  const choice = definition as Extract<OptionDefinition, { kind: 'choice' }>;
  const choices = choice.choices;
  if (choices.length === 0) return;
  const value = typeof current === 'string' ? current : choice.defaultValue;
  const at = choices.findIndex((item) => item.value === value);
  const base = at < 0 ? 0 : at;
  const delta = change === 'choose-prev' ? -1 : 1;
  const next = choices[(base + delta + choices.length) % choices.length];
  if (next) session.setOption(definition.id, next.value);
}
