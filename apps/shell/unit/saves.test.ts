import { IDBFactory } from 'fake-indexeddb';
import { describe, expect, it } from 'vitest';
import { openStorage } from '@hearthbox/runtime';
import { exportSaves, importSaves, SAVE_FORMAT } from '../src/saves.js';

function open() {
  return openStorage({ factory: new IDBFactory(), name: 'hearthbox-saves-test' });
}

describe('本地存档导出/导入', () => {
  it('只导出当前游戏的键', async () => {
    const storage = await open();
    await storage.put('saves', ['me.game', 'state'], { level: 3 });
    await storage.put('saves', ['me.game', 'settings'], { volume: 0.5 });
    await storage.put('saves', ['me.other', 'state'], { level: 9 });

    const envelope = await exportSaves(storage, 'me.game', '1.0.0');
    expect(envelope.format).toBe(SAVE_FORMAT);
    expect(envelope.data).toEqual({
      state: { level: 3 },
      settings: { volume: 0.5 },
    });
    storage.close();
  });

  it('导入会替换该游戏的全部存档键', async () => {
    const storage = await open();
    await storage.put('saves', ['me.game', 'old'], 'remove-me');
    await storage.put('saves', ['me.other', 'state'], 'keep');

    const envelope = await importSaves(
      storage,
      {
        format: SAVE_FORMAT,
        formatVersion: 1,
        gameId: 'me.game',
        gameVersion: '1.0.0',
        savedAt: new Date().toISOString(),
        data: { state: { level: 7 } },
      },
      'me.game',
    );

    expect(envelope.data['state']).toEqual({ level: 7 });
    expect(await storage.get('saves', ['me.game', 'old'])).toBeUndefined();
    expect(await storage.get('saves', ['me.game', 'state'])).toEqual({ level: 7 });
    expect(await storage.get('saves', ['me.other', 'state'])).toBe('keep');
    storage.close();
  });

  it('拒绝别的游戏的存档', async () => {
    const storage = await open();
    await expect(
      importSaves(
        storage,
        {
          format: SAVE_FORMAT,
          formatVersion: 1,
          gameId: 'me.other',
          gameVersion: '1.0.0',
          savedAt: new Date().toISOString(),
          data: {},
        },
        'me.game',
      ),
    ).rejects.toThrow('不是当前游戏');
    storage.close();
  });

  it('拒绝畸形文件并跳过危险键', async () => {
    const storage = await open();
    await expect(importSaves(storage, { format: 'nope' }, 'me.game')).rejects.toThrow(
      '不是炉边存档文件',
    );

    const envelope = await importSaves(
      storage,
      {
        format: SAVE_FORMAT,
        formatVersion: 1,
        gameId: 'me.game',
        gameVersion: '1.0.0',
        savedAt: new Date().toISOString(),
        data: { state: 1, __proto__: { polluted: true } },
      },
      'me.game',
    );
    expect(envelope.data).toHaveProperty('state');
    expect(envelope.data).not.toHaveProperty('__proto__');
    storage.close();
  });
});
