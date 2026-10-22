import { IDBFactory } from 'fake-indexeddb';
import { describe, expect, it } from 'vitest';
import {
  clampNumber,
  createOptionStore,
  defaultValueOf,
  normalize,
  validate,
} from '../src/option-store.js';
import { openStorage } from '../src/storage.js';
import type { NumberOption, OptionDefinition } from '@hearthbox/sdk';

const speed: NumberOption = {
  id: 'move-speed',
  name: '移动速度',
  kind: 'number',
  min: 1,
  max: 3,
  step: 0.25,
  defaultValue: 1,
};

const god: OptionDefinition = { id: 'god', name: '无敌' };

const difficulty: OptionDefinition = {
  id: 'difficulty',
  name: '难度',
  kind: 'choice',
  choices: [
    { value: 'easy', label: '简单' },
    { value: 'normal', label: '普通' },
  ],
  defaultValue: 'normal',
};

async function newStore(name: string) {
  const storage = await openStorage({ factory: new IDBFactory(), name });
  const store = createOptionStore(storage, 'game.x', {});
  return { storage, store };
}

describe('clampNumber', () => {
  it('夹到范围内', () => {
    expect(clampNumber(speed, 0.1)).toBe(1);
    expect(clampNumber(speed, 999)).toBe(3);
  });

  it('对齐步进', () => {
    expect(clampNumber(speed, 2.26)).toBe(2.25);
    expect(clampNumber(speed, 2.1)).toBe(2);
  });

  it('非数值退回默认', () => {
    expect(clampNumber(speed, Number.NaN)).toBe(1);
    expect(clampNumber(speed, 'x' as unknown)).toBe(1);
  });
});

describe('validate', () => {
  it('max 不大于 min 抛错', () => {
    expect(() => validate({ ...speed, max: 1 })).toThrow('max 必须大于 min');
  });

  it('step 非正抛错', () => {
    expect(() => validate({ ...speed, step: 0 })).toThrow('step 必须大于 0');
  });

  it('默认值越界抛错', () => {
    expect(() => validate({ ...speed, defaultValue: 99 })).toThrow();
  });

  it('默认值不符合步进抛错', () => {
    expect(() => validate({ ...speed, defaultValue: 1.1 })).toThrow('步进');
  });

  it('choices 少于两项抛错', () => {
    expect(() =>
      validate({
        ...difficulty,
        kind: 'choice',
        choices: [{ value: 'a', label: 'A' }],
      } as OptionDefinition),
    ).toThrow('至少两项');
  });

  it('默认值不在 choices 里抛错', () => {
    expect(() => validate({ ...difficulty, defaultValue: 'hard' } as OptionDefinition)).toThrow();
  });

  it('缺 id 或 name 抛错', () => {
    expect(() => validate({ id: '', name: 'x' })).toThrow('缺少 id');
    expect(() => validate({ id: 'x', name: '' })).toThrow('缺少 name');
  });

  it('合法定义不抛错', () => {
    expect(() => validate(speed)).not.toThrow();
    expect(() => validate(god)).not.toThrow();
    expect(() => validate(difficulty)).not.toThrow();
  });
});

describe('normalize 与 defaultValueOf', () => {
  it('number 型收敛成合法数值', () => {
    expect(normalize(speed, 99)).toBe(3);
  });

  it('choice 型非法值退回默认', () => {
    expect(normalize(difficulty, 'nope')).toBe('normal');
  });

  it('boolean 型非 true 都是 false', () => {
    expect(normalize(god, 'yes')).toBe(false);
    expect(normalize(god, true)).toBe(true);
  });

  it('默认值按类型取', () => {
    expect(defaultValueOf(speed)).toBe(1);
    expect(defaultValueOf(god)).toBe(false);
    expect(defaultValueOf(difficulty)).toBe('normal');
  });
});

describe('createOptionStore', () => {
  it('三个 scope 各自过滤', async () => {
    const { storage, store } = await newStore('opt-scope');
    store.api.declare({ ...speed, scope: 'cheat' });
    store.api.declare({
      id: 'volume',
      name: '音量',
      kind: 'number',
      min: 0,
      max: 1,
      step: 0.1,
      defaultValue: 1,
      scope: 'setting',
    });
    store.api.declare({ id: 'first-win', name: '首次通关', scope: 'status' });

    expect(store.api.byScope('cheat').map((d) => d.id)).toEqual(['move-speed']);
    expect(store.api.byScope('setting').map((d) => d.id)).toEqual(['volume']);
    expect(store.api.byScope('status').map((d) => d.id)).toEqual(['first-win']);
    storage.close();
  });

  it('未标 scope 的默认算 cheat', async () => {
    const { storage, store } = await newStore('opt-default-scope');
    store.api.declare(god);
    expect(store.api.byScope('cheat')).toHaveLength(1);
    storage.close();
  });

  it('value 返回原始类型', async () => {
    const { storage, store } = await newStore('opt-value');
    store.api.declare(speed);
    store.api.declare(god);
    store.api.declare(difficulty);

    expect(store.api.value('move-speed')).toBe(1);
    expect(store.api.value('god')).toBe(false);
    expect(store.api.value('difficulty')).toBe('normal');
    expect(store.api.value('nope')).toBeUndefined();
    storage.close();
  });

  it('便利方法按类型返回值', async () => {
    const { storage, store } = await newStore('opt-helpers');
    store.api.declare(speed);
    store.api.declare(god);
    store.api.declare(difficulty);

    store.set('move-speed', 2);
    store.set('god', true);
    store.set('difficulty', 'easy');

    expect(store.api.number('move-speed')).toBe(2);
    expect(store.api.number('god')).toBe(0);
    expect(store.api.choice('difficulty')).toBe('easy');
    expect(store.api.choice('move-speed')).toBe('');
    storage.close();
  });

  it('set 越界会被夹取', async () => {
    const { storage, store } = await newStore('opt-clamp');
    store.api.declare(speed);
    store.set('move-speed', 100);
    expect(store.api.number('move-speed')).toBe(3);
    store.set('move-speed', -5);
    expect(store.api.number('move-speed')).toBe(1);
    storage.close();
  });

  it('重复声明抛错', async () => {
    const { storage, store } = await newStore('opt-dup');
    store.api.declare(speed);
    expect(() => store.api.declare(speed)).toThrow('重复');
    storage.close();
  });

  it('订阅能收到变化', async () => {
    const { storage, store } = await newStore('opt-sub');
    store.api.declare(speed);
    let calls = 0;
    const off = store.subscribe(() => (calls += 1));
    store.set('move-speed', 2);
    expect(calls).toBe(1);
    off();
    store.set('move-speed', 3);
    expect(calls).toBe(1);
    storage.close();
  });

  it('跨会话持久化三种类型', async () => {
    const storage = await openStorage({ factory: new IDBFactory(), name: 'opt-persist' });
    const first = createOptionStore(storage, 'game.x', {});
    first.api.declare(speed);
    first.api.declare(god);
    first.api.declare(difficulty);
    first.set('move-speed', 2.5);
    first.set('god', true);
    first.set('difficulty', 'easy');
    await first.flush();
    first.reset();

    const { loadOptions } = await import('../src/option-store.js');
    const saved = await loadOptions(storage, 'game.x');
    expect(saved['move-speed']).toBe(2.5);
    expect(saved['god']).toBe(true);
    expect(saved['difficulty']).toBe('easy');

    const second = createOptionStore(storage, 'game.x', saved);
    second.api.declare(speed);
    second.api.declare(god);
    second.api.declare(difficulty);
    expect(second.api.number('move-speed')).toBe(2.5);
    expect(second.api.enabled('god')).toBe(true);
    expect(second.api.choice('difficulty')).toBe('easy');
    storage.close();
  });

  it('保存值超出新范围时重新夹取', async () => {
    const storage = await openStorage({ factory: new IDBFactory(), name: 'opt-reshrink' });
    // 旧版本上限 10，玩家调到 10；新版本收到 3
    const store = createOptionStore(storage, 'game.x', { 'move-speed': 10 });
    store.api.declare(speed);
    expect(store.api.number('move-speed')).toBe(3);
    storage.close();
  });

  it('保存的 choice 已不存在时退回默认', async () => {
    const storage = await openStorage({ factory: new IDBFactory(), name: 'opt-stale-choice' });
    const store = createOptionStore(storage, 'game.x', { difficulty: 'removed-mode' });
    store.api.declare(difficulty);
    expect(store.api.choice('difficulty')).toBe('normal');
    storage.close();
  });

  it('enabled 对数值型以非默认为准', async () => {
    const { storage, store } = await newStore('opt-enabled');
    store.api.declare(speed);
    expect(store.api.enabled('move-speed')).toBe(false);
    store.set('move-speed', 1.5);
    expect(store.api.enabled('move-speed')).toBe(true);
    store.set('move-speed', 1);
    expect(store.api.enabled('move-speed')).toBe(false);
    storage.close();
  });

  it('beginFrame 只在状态翻转那帧标记 justEnabled', async () => {
    const { storage, store } = await newStore('opt-just');
    store.api.declare(god);
    store.set('god', true);
    store.beginFrame();
    expect(store.api.justEnabled('god')).toBe(true);
    store.beginFrame();
    expect(store.api.justEnabled('god')).toBe(false);
    storage.close();
  });
});
