import { IDBFactory } from 'fake-indexeddb';
import { describe, expect, it } from 'vitest';
import { openStorage } from '../src/storage.js';
import { createSaveStore } from '../src/save-store.js';

function newStorage(name: string) {
  return openStorage({ factory: new IDBFactory(), name });
}

describe('createSaveStore', () => {
  it('set 之后能同步读回', async () => {
    const storage = await newStorage('save-read');
    const saves = createSaveStore(storage, 'game.a');
    await saves.load();

    saves.api.set('hp', 3);
    expect(saves.api.get('hp')).toBe(3);
    storage.close();
  });

  it('节流落盘：不调 flush 时值还在内存里', async () => {
    const storage = await newStorage('save-throttle');
    const saves = createSaveStore(storage, 'game.a');
    await saves.load();

    saves.api.set('hp', 5);
    // 没有 flush，IndexedDB 里应该还没有
    expect(await storage.get('saves', ['game.a', 'hp'])).toBeUndefined();
    storage.close();
  });

  it('flush 之后值在库里', async () => {
    const storage = await newStorage('save-flush');
    const saves = createSaveStore(storage, 'game.a');
    await saves.load();

    saves.api.set('hp', 7);
    await saves.flush();
    expect(await storage.get('saves', ['game.a', 'hp'])).toBe(7);
    storage.close();
  });

  it('flushNow 不等待也会写入（页面卸载路径）', async () => {
    const storage = await newStorage('save-flushnow');
    const saves = createSaveStore(storage, 'game.a');
    await saves.load();

    saves.api.set('progress', { level: 4 });
    saves.flushNow();

    // 给 IndexedDB 一点时间完成同步发起的事务
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(await storage.get('saves', ['game.a', 'progress'])).toEqual({ level: 4 });
    storage.close();
  });

  it('delete 会从库里删掉', async () => {
    const storage = await newStorage('save-delete');
    const saves = createSaveStore(storage, 'game.a');
    await saves.load();

    saves.api.set('hp', 1);
    await saves.flush();
    saves.api.delete('hp');
    await saves.flush();

    expect(await storage.get('saves', ['game.a', 'hp'])).toBeUndefined();
    storage.close();
  });

  it('不同游戏的存档互不可见', async () => {
    const storage = await newStorage('save-isolation');
    const a = createSaveStore(storage, 'game.a');
    await a.load();
    a.api.set('score', 100);
    await a.flush();

    const b = createSaveStore(storage, 'game.b');
    await b.load();
    expect(b.api.get('score')).toBeUndefined();
    storage.close();
  });

  it('重新 load 能读回上次的存档', async () => {
    const storage = await newStorage('save-reload');
    const first = createSaveStore(storage, 'game.a');
    await first.load();
    first.api.set('state', { x: 42 });
    await first.flush();
    first.reset();

    const second = createSaveStore(storage, 'game.a');
    await second.load();
    expect(second.api.get('state')).toEqual({ x: 42 });
    storage.close();
  });
});
