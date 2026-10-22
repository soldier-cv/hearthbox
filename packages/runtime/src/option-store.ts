import type {
  ChoiceOption,
  NumberOption,
  OptionDefinition,
  OptionScope,
  OptionsApi,
  OptionValue,
} from '@hearthbox/sdk';
import type { Storage } from './storage.js';

/** 存档合并落盘的最小间隔。 */
const FLUSH_DELAY = 1000;

export interface OptionStore {
  readonly api: OptionsApi;
  readonly set: (id: string, value: OptionValue) => void;
  readonly get: (id: string) => OptionValue | undefined;
  readonly subscribe: (listener: () => void) => () => void;
  readonly declared: readonly OptionDefinition[];
  beginFrame(): void;
  flushNow(): void;
  flush(): Promise<void>;
  reset(): void;
}

/** 把数值夹进范围并对齐步进。越界或非数值都退回默认值。 */
export function clampNumber(definition: NumberOption, raw: unknown): number {
  if (typeof raw !== 'number' || !Number.isFinite(raw)) return definition.defaultValue;

  const clamped = Math.min(definition.max, Math.max(definition.min, raw));
  if (definition.step <= 0) return clamped;

  const steps = Math.round((clamped - definition.min) / definition.step);
  const aligned = definition.min + steps * definition.step;
  return Math.min(definition.max, Math.max(definition.min, Number(aligned.toFixed(6))));
}

function clampChoice(definition: ChoiceOption, raw: unknown): string {
  if (typeof raw !== 'string') return definition.defaultValue;
  return definition.choices.some((item) => item.value === raw) ? raw : definition.defaultValue;
}

/** 按 kind 把任意输入收敛成合法值。 */
export function normalize(definition: OptionDefinition, raw: unknown): OptionValue {
  if (definition.kind === 'number') return clampNumber(definition, raw);
  if (definition.kind === 'choice') return clampChoice(definition, raw);
  return raw === true;
}

/** 默认值。 */
export function defaultValueOf(definition: OptionDefinition): OptionValue {
  if (definition.kind === 'number') return definition.defaultValue;
  if (definition.kind === 'choice') return definition.defaultValue;
  return definition.defaultEnabled ?? false;
}

/**
 * 声明校验。
 *
 * 范围写错属于设计错误，应该在 create 阶段就抛，而不是等到玩家拖滑杆才发现。
 */
export function validate(definition: OptionDefinition): void {
  if (!definition.id) throw new Error('可调项缺少 id');
  if (!definition.name) throw new Error(`可调项 ${definition.id} 缺少 name`);

  if (definition.kind === 'number') {
    const { min, max, step, defaultValue, id } = definition;
    if (!(max > min)) throw new Error(`可调项 ${id}：max 必须大于 min`);
    if (!(step > 0)) throw new Error(`可调项 ${id}：step 必须大于 0`);
    if (defaultValue < min || defaultValue > max) {
      throw new Error(`可调项 ${id}：defaultValue 必须在 [min, max] 内`);
    }
    if (clampNumber(definition, defaultValue) !== defaultValue) {
      throw new Error(`可调项 ${id}：defaultValue 必须符合 step 步进`);
    }
  }

  if (definition.kind === 'choice') {
    const { choices, defaultValue, id } = definition;
    if (choices.length < 2) throw new Error(`可调项 ${id}：choices 至少两项`);
    if (!choices.some((item) => item.value === defaultValue)) {
      throw new Error(`可调项 ${id}：defaultValue 必须是 choices 之一`);
    }
  }
}

/** 值是否算"开启"。数值型以"非默认值"为开启，这对金手指最有意义。 */
function isOn(definition: OptionDefinition, value: OptionValue | undefined): boolean {
  if (value === undefined) return false;
  if (definition.kind === 'number') return value !== definition.defaultValue;
  if (definition.kind === 'choice') return value !== definition.defaultValue;
  return value === true;
}

/**
 * 可调项状态：金手指、设置、只读状态共用一个 store。
 *
 * 共用而不是各建一套，因为它们的生命周期完全一样：游戏 create 时声明、
 * 运行中读、退出时落盘、重进时恢复。差别只在 `scope`，那只是渲染时的过滤条件。
 */
export function createOptionStore(
  storage: Storage,
  gameId: string,
  saved: Record<string, OptionValue>,
): OptionStore {
  const declared: OptionDefinition[] = [];
  const byId = new Map<string, OptionDefinition>();
  const values = new Map<string, OptionValue>();
  const previous = new Map<string, boolean>();
  const justEnabled = new Set<string>();
  const dirty = new Set<string>();
  const listeners = new Set<() => void>();

  let timer: ReturnType<typeof setTimeout> | null = null;

  function notify(): void {
    for (const listener of listeners) listener();
  }

  function schedule(): void {
    if (timer !== null) return;
    timer = setTimeout(() => {
      timer = null;
      void flush().catch(() => {});
    }, FLUSH_DELAY);
  }

  async function flush(): Promise<void> {
    if (dirty.size === 0) return;
    const ids = [...dirty];
    dirty.clear();
    for (const id of ids) {
      try {
        await storage.put('cheats', [gameId, id], values.get(id));
      } catch {
        dirty.add(id);
      }
    }
  }

  function read(id: string): OptionValue | undefined {
    return values.get(id);
  }

  const api: OptionsApi = {
    declare(definition) {
      if (byId.has(definition.id)) {
        throw new Error(`可调项 id 重复：${definition.id}`);
      }
      validate(definition);

      byId.set(definition.id, definition);
      declared.push(definition);

      // 已保存值优先，但必须重新收敛：游戏可能改了范围或候选值。
      const raw = saved[definition.id];
      const value = raw === undefined ? defaultValueOf(definition) : normalize(definition, raw);
      values.set(definition.id, value);
      previous.set(definition.id, isOn(definition, value));

      // 默认值也落盘，否则下次读回来就是"没设置过"。
      if (raw === undefined) {
        dirty.add(definition.id);
        schedule();
      }
    },
    value: read,
    enabled: (id) => {
      const definition = byId.get(id);
      return definition ? isOn(definition, read(id)) : false;
    },
    number(id) {
      const definition = byId.get(id);
      if (!definition || definition.kind !== 'number') return 0;
      const value = read(id);
      return typeof value === 'number' ? value : definition.defaultValue;
    },
    choice(id) {
      const definition = byId.get(id);
      if (!definition || definition.kind !== 'choice') return '';
      const value = read(id);
      return typeof value === 'string' ? value : definition.defaultValue;
    },
    justEnabled: (id) => justEnabled.has(id),
    get all() {
      return declared;
    },
    byScope: (scope: OptionScope) => declared.filter((item) => (item.scope ?? 'cheat') === scope),
  };

  return {
    api,
    declared,
    set(id, value) {
      const definition = byId.get(id);
      if (!definition) return;

      values.set(id, normalize(definition, value));
      dirty.add(id);
      schedule();
      notify();
    },
    get: read,
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    beginFrame() {
      justEnabled.clear();
      for (const definition of declared) {
        const on = isOn(definition, read(definition.id));
        if (on && previous.get(definition.id) !== true) justEnabled.add(definition.id);
        previous.set(definition.id, on);
      }
    },
    flushNow() {
      for (const id of dirty) storage.putNow('cheats', [gameId, id], values.get(id));
      dirty.clear();
    },
    flush,
    reset() {
      if (timer !== null) {
        clearTimeout(timer);
        timer = null;
      }
      // 保留 declared：设置页在游戏退出后仍要能看到有哪些项。
      values.clear();
      previous.clear();
      justEnabled.clear();
      dirty.clear();
    },
  };
}

/** 读回某个游戏已保存的全部可调项。 */
export async function loadOptions(
  storage: Storage,
  gameId: string,
): Promise<Record<string, OptionValue>> {
  const keys = await storage.keys('cheats');
  const result: Record<string, OptionValue> = {};
  for (const key of keys) {
    if (!Array.isArray(key) || key.length !== 2 || key[0] !== gameId) continue;
    const id = key[1];
    if (typeof id !== 'string') continue;
    const value = await storage.get<OptionValue>('cheats', key);
    if (typeof value === 'boolean' || typeof value === 'number' || typeof value === 'string') {
      result[id] = value;
    }
  }
  return result;
}
