import { IDBFactory } from 'fake-indexeddb';
import { describe, expect, it } from 'vitest';
import { clampNumber, createCheatStore, validateDefinition } from '../src/cheat-store.js';
import { openStorage } from '../src/storage.js';
import type { NumberCheat } from '@hearthbox/sdk';

const xpBoost: NumberCheat = {
  id: 'xp-boost',
  name: '经验倍率',
  kind: 'number',
  min: 1,
  max: 5,
  step: 0.5,
  defaultValue: 1,
};

async function newStore(name: string) {
  const storage = await openStorage({ factory: new IDBFactory(), name });
  const store = createCheatStore(storage, 'game.x', {});
  return { storage, store };
}

describe('clampNumber', () => {
  it('低于下限时夹到 min', () => {
    expect(clampNumber(xpBoost, 0.1)).toBe(1);
  });

  it('高于上限时夹到 max', () => {
    expect(clampNumber(xpBoost, 999)).toBe(5);
  });

  it('对齐到 step', () => {
    expect(clampNumber(xpBoost, 2.26)).toBe(2.5);
    expect(clampNumber(xpBoost, 2.24)).toBe(2);
  });

  it('非数值退回默认值', () => {
    expect(clampNumber(xpBoost, Number.NaN)).toBe(1);
    expect(clampNumber(xpBoost, 'abc' as unknown)).toBe(1);
    expect(clampNumber(xpBoost, Infinity)).toBe(1);
  });

  it('浮点误差不会留下 1.3000000000000003', () => {
    const d: NumberCheat = { ...xpBoost, min: 0.1, max: 1, step: 0.1, defaultValue: 0.1 };
    const value = clampNumber(d, 0.3);
    expect(String(value).length).toBeLessThan(6);
  });
});

describe('validateDefinition', () => {
  it('max 不大于 min 时抛错', () => {
    expect(() => validateDefinition({ ...xpBoost, max: 1 })).toThrow('max 必须大于 min');
  });

  it('step 非正数时抛错', () => {
    expect(() => validateDefinition({ ...xpBoost, step: 0 })).toThrow('step 必须大于 0');
  });

  it('默认值越界时抛错', () => {
    expect(() => validateDefinition({ ...xpBoost, defaultValue: 99 })).toThrow('defaultValue');
  });

  it('默认值不符合步进时抛错', () => {
    expect(() => validateDefinition({ ...xpBoost, defaultValue: 1.2 })).toThrow('step 步进');
  });

  it('合法定义不抛错', () => {
    expect(() => validateDefinition(xpBoost)).not.toThrow();
  });
});

describe('createCheatStore', () => {
  it('数值型初值是 defaultValue', async () => {
    const { storage, store } = await newStore('cheat-def');
    store.api.declare(xpBoost);
    expect(store.api.value('xp-boost')).toBe(1);
    expect(store.api.enabled('xp-boost')).toBe(false);
    storage.close();
  });

  it('set 越界会夹取', async () => {
    const { storage, store } = await newStore('cheat-clamp');
    store.api.declare(xpBoost);
    store.set('xp-boost', 100);
    expect(store.api.value('xp-boost')).toBe(5);
    store.set('xp-boost', -5);
    expect(store.api.value('xp-boost')).toBe(1);
    storage.close();
  });

  it('改成非默认值后 enabled 变 true', async () => {
    const { storage, store } = await newStore('cheat-enable');
    store.api.declare(xpBoost);
    expect(store.api.enabled('xp-boost')).toBe(false);
    store.set('xp-boost', 3);
    expect(store.api.enabled('xp-boost')).toBe(true);
    store.set('xp-boost', 1);
    expect(store.api.enabled('xp-boost')).toBe(false);
    storage.close();
  });

  it('布尔型 value() 返回 0/1 而不是抛错', async () => {
    const { storage, store } = await newStore('cheat-bool');
    store.api.declare({ id: 'god', name: '无敌' });
    expect(store.api.value('god')).toBe(0);
    store.set('god', true);
    expect(store.api.value('god')).toBe(1);
    expect(store.api.enabled('god')).toBe(true);
    storage.close();
  });

  it('重复声明抛错', async () => {
    const { storage, store } = await newStore('cheat-dup');
    store.api.declare(xpBoost);
    expect(() => store.api.declare(xpBoost)).toThrow('重复');
    storage.close();
  });

  it('非法范围在声明时抛错', async () => {
    const { storage, store } = await newStore('cheat-bad');
    expect(() => store.api.declare({ ...xpBoost, id: 'bad', max: 0 })).toThrow();
    storage.close();
  });

  it('数值跨会话持久化', async () => {
    const storage = await openStorage({ factory: new IDBFactory(), name: 'cheat-persist' });
    const first = createCheatStore(storage, 'game.x', {});
    first.api.declare(xpBoost);
    first.set('xp-boost', 4);
    await first.flush();
    first.reset();

    // 重新读回
    const saved = await import('../src/cheat-store.js').then((m) =>
      m.loadCheatState(storage, 'game.x'),
    );
    expect(saved['xp-boost']).toBe(4);

    const second = createCheatStore(storage, 'game.x', saved);
    second.api.declare(xpBoost);
    expect(second.api.value('xp-boost')).toBe(4);
    storage.close();
  });

  it('保存值超出新范围时被重新夹取', async () => {
    const storage = await openStorage({ factory: new IDBFactory(), name: 'cheat-reshrink' });
    // 旧版本给的范围是 1..10，玩家调到 10
    const store = createCheatStore(storage, 'game.x', { 'xp-boost': 10 });
    // 新版本把上限收到 5
    store.api.declare(xpBoost);
    expect(store.api.value('xp-boost')).toBe(5);
    storage.close();
  });
});
