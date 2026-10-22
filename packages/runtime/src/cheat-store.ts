import type { CheatDefinition, CheatsApi, NumberCheat } from '@hearthbox/sdk';
import type { Storage } from './storage.js';

/** 存档合并落盘的最小间隔。 */
const FLUSH_DELAY = 1000;

/** 金手指的当前值：布尔型存 boolean，数值型存 number。 */
type CheatValue = boolean | number;

export interface CheatStore {
  readonly api: CheatsApi;
  readonly set: (id: string, value: CheatValue) => void;
  readonly get: (id: string) => CheatValue | undefined;
  /** 订阅变化。返回取消函数。 */
  readonly subscribe: (listener: () => void) => () => void;
  readonly declared: readonly CheatDefinition[];
  beginFrame(): void;
  flushNow(): void;
  flush(): Promise<void>;
  reset(): void;
}

/** 把数值夹进范围并对齐步进。越界或非数值都退回默认值。 */
export function clampNumber(definition: NumberCheat, raw: unknown): number {
  if (typeof raw !== 'number' || !Number.isFinite(raw)) return definition.defaultValue;

  const clamped = Math.min(definition.max, Math.max(definition.min, raw));
  if (definition.step <= 0) return clamped;

  // 对齐到 min + n*step，避免出现 1.33333 这种值。
  const steps = Math.round((clamped - definition.min) / definition.step);
  const aligned = definition.min + steps * definition.step;
  // 浮点误差修正：对齐后再夹一次。
  return Math.min(definition.max, Math.max(definition.min, Number(aligned.toFixed(6))));
}

/** 声明时校验范围合法性。范围写错属于设计错误，应在 create 阶段就暴露。 */
export function validateDefinition(definition: CheatDefinition): void {
  if (definition.kind !== 'number') return;

  const { min, max, step, defaultValue } = definition;
  if (!(max > min)) {
    throw new Error(`金手指 ${definition.id}：max 必须大于 min`);
  }
  if (!(step > 0)) {
    throw new Error(`金手指 ${definition.id}：step 必须大于 0`);
  }
  if (defaultValue < min || defaultValue > max) {
    throw new Error(`金手指 ${definition.id}：defaultValue 必须在 [min, max] 内`);
  }
  if (clampNumber(definition, defaultValue) !== defaultValue) {
    throw new Error(`金手指 ${definition.id}：defaultValue 必须符合 step 步进`);
  }
}

/**
 * 金手指状态：与存档分开存。
 *
 * 分开的理由见 docs/cheats.md：卸载游戏不该清掉玩家调过的参数，
 * 否则重装后又全部回到默认。
 */
export function createCheatStore(
  storage: Storage,
  gameId: string,
  saved: Record<string, CheatValue>,
): CheatStore {
  const declared: CheatDefinition[] = [];
  const byId = new Map<string, CheatDefinition>();
  const values = new Map<string, CheatValue>();
  const previous = new Map<string, boolean>();
  const justEnabled = new Set<string>();
  const dirty = new Set<string>();
  /** 面板订阅者。变化时通知，面板自己决定怎么重绘。 */
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

  function isOn(id: string): boolean {
    const definition = byId.get(id);
    if (!definition) return false;
    const value = values.get(id);
    if (definition.kind === 'number') return value !== definition.defaultValue;
    return value === true;
  }

  const api: CheatsApi = {
    declare(definition) {
      if (byId.has(definition.id)) {
        throw new Error(`金手指 id 重复：${definition.id}`);
      }
      validateDefinition(definition);

      byId.set(definition.id, definition);
      declared.push(definition);

      // 已保存的值优先，但必须重新夹取：游戏可能改了范围。
      const raw = saved[definition.id];
      const value: CheatValue =
        definition.kind === 'number'
          ? clampNumber(definition, raw === undefined ? definition.defaultValue : raw)
          : typeof raw === 'boolean'
            ? raw
            : (definition.defaultEnabled ?? false);

      values.set(definition.id, value);
      previous.set(definition.id, isOn(definition.id));

      // 默认值也要落盘，否则下次读回来就是"没设置过"。
      if (raw === undefined) {
        dirty.add(definition.id);
        schedule();
      }
    },
    enabled: isOn,
    justEnabled: (id) => justEnabled.has(id),
    value(id) {
      const definition = byId.get(id);
      if (!definition) return 0;
      const value = values.get(id);
      if (typeof value === 'number') return value;
      return value === true ? 1 : 0;
    },
    get all() {
      return declared;
    },
  };

  return {
    api,
    declared,
    set(id, value) {
      const definition = byId.get(id);
      if (!definition) return;

      const next: CheatValue =
        definition.kind === 'number' ? clampNumber(definition, value) : Boolean(value);

      values.set(id, next);
      dirty.add(id);
      schedule();
      notify();
    },
    get(id) {
      return values.get(id);
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    beginFrame() {
      justEnabled.clear();
      for (const definition of declared) {
        const on = isOn(definition.id);
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
      // 保留 declared：设置页在游戏退出后仍要能看到有哪些金手指。
      values.clear();
      previous.clear();
      justEnabled.clear();
      dirty.clear();
    },
  };
}

/** 读回某个游戏已保存的金手指状态。 */
export async function loadCheatState(
  storage: Storage,
  gameId: string,
): Promise<Record<string, CheatValue>> {
  const keys = await storage.keys('cheats');
  const result: Record<string, CheatValue> = {};
  for (const key of keys) {
    if (!Array.isArray(key) || key.length !== 2 || key[0] !== gameId) continue;
    const cheatId = key[1];
    if (typeof cheatId !== 'string') continue;
    const value = await storage.get<CheatValue>('cheats', key);
    if (typeof value === 'boolean' || typeof value === 'number') result[cheatId] = value;
  }
  return result;
}
