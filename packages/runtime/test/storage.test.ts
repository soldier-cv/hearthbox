import { IDBFactory } from 'fake-indexeddb';
import { describe, expect, it } from 'vitest';
import { DB_NAME, openStorage } from '../src/storage.js';

function open(): ReturnType<typeof openStorage> {
  return openStorage({ factory: new IDBFactory(), name: `${DB_NAME}-test` });
}

describe('openStorage', () => {
  it('打开后包含全部对象库', async () => {
    const storage = await open();
    // 写一个值再读回来，间接确认 store 存在
    await storage.put('settings', 'volume', 0.8);
    expect(await storage.get('settings', 'volume')).toBe(0.8);
    storage.close();
  });

  it('get 不存在的键返回 undefined', async () => {
    const storage = await open();
    expect(await storage.get('saves', 'missing')).toBeUndefined();
    storage.close();
  });

  it('delete 生效', async () => {
    const storage = await open();
    await storage.put('saves', 'k', 1);
    await storage.delete('saves', 'k');
    expect(await storage.get('saves', 'k')).toBeUndefined();
    storage.close();
  });

  it('keys 返回全部键', async () => {
    const storage = await open();
    await storage.put('saves', ['a', 'x'], 1);
    await storage.put('saves', ['b', 'y'], 2);
    const keys = await storage.keys('saves');
    expect(keys).toHaveLength(2);
    storage.close();
  });

  it('transaction 里的多步一起提交', async () => {
    const storage = await open();
    await storage.transaction(['files', 'installs'], 'readwrite', async (tx) => {
      tx.objectStore('files').put(new Blob(['x']), ['game', '1.0.0', 'game.js']);
      tx.objectStore('installs').put({ version: '1.0.0' }, 'game');
    });

    expect(await storage.get('files', ['game', '1.0.0', 'game.js'])).toBeDefined();
    expect(await storage.get('installs', 'game')).toEqual({ version: '1.0.0' });
    storage.close();
  });

  it('transaction 抛错时回滚，前面的写不留下', async () => {
    const storage = await open();
    await storage.put('installs', 'game', { version: '1.0.0' });

    await expect(
      storage.transaction(['installs'], 'readwrite', async (tx) => {
        tx.objectStore('installs').put({ version: '2.0.0' }, 'game');
        throw new Error('安装失败');
      }),
    ).rejects.toThrow('安装失败');

    expect(await storage.get('installs', 'game')).toEqual({ version: '1.0.0' });
    storage.close();
  });

  it('重复打开同一个库不会重建', async () => {
    const factory = new IDBFactory();
    const first = await openStorage({ factory, name: 'repeat' });
    await first.put('settings', 'a', 1);
    first.close();

    const second = await openStorage({ factory, name: 'repeat' });
    expect(await second.get('settings', 'a')).toBe(1);
    second.close();
  });
});
