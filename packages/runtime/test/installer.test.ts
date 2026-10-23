import { IDBFactory } from 'fake-indexeddb';
import { strToU8, zipSync } from 'fflate';
import { describe, expect, it } from 'vitest';
import {
  installFromZip,
  InstallError,
  listInstalled,
  readInstalledFile,
  uninstallGame,
} from '../src/installer.js';
import { openStorage } from '../src/storage.js';

const MANIFEST = {
  id: 'me.test-game',
  name: '测试游戏',
  summary: '导入测试',
  version: '1.0.0',
  sdk: '^0.1.0',
  entry: 'game.js',
  display: { width: 320, height: 180, pixelArt: true, scale: 'integer' },
  players: { min: 1, max: 1 },
  input: ['pad', 'keyboard'],
  pointer: 'hidden',
  license: 'MIT',
};

function open() {
  return openStorage({ factory: new IDBFactory(), name: 'hearthbox-installer-test' });
}

function pack(files: Record<string, string | Uint8Array>): Uint8Array {
  const entries: Record<string, Uint8Array> = {};
  for (const [path, value] of Object.entries(files)) {
    entries[path] = typeof value === 'string' ? strToU8(value) : value;
  }
  return zipSync(entries);
}

function baseFiles(): Record<string, string> {
  return {
    'game.json': JSON.stringify(MANIFEST),
    'game.js': 'export default { create() { return { update() {}, render() {} }; } };',
    'assets/hello.txt': 'hi',
  };
}

describe('installFromZip', () => {
  it('安装后能列出、读取文件', async () => {
    const storage = await open();
    const record = await installFromZip(storage, pack(baseFiles()), 'test.hbx');

    expect(record.id).toBe('me.test-game');
    expect(record.name).toBe('测试游戏');
    expect(record.files).toContain('assets/hello.txt');

    const records = await listInstalled(storage);
    expect(records).toHaveLength(1);
    expect(records[0]?.version).toBe('1.0.0');

    const text = await (await readInstalledFile(storage, record.id, 'assets/hello.txt')).text();
    expect(text).toBe('hi');
    storage.close();
  });

  it('同 id 重新安装会替换旧文件', async () => {
    const storage = await open();
    await installFromZip(storage, pack(baseFiles()), 'old.hbx');

    await installFromZip(
      storage,
      pack({
        ...baseFiles(),
        'game.json': JSON.stringify({ ...MANIFEST, version: '1.1.0' }),
        'assets/new.txt': 'new',
      }),
      'new.hbx',
    );

    const records = await listInstalled(storage);
    expect(records).toHaveLength(1);
    expect(records[0]?.version).toBe('1.1.0');
    expect(await storage.get('files', ['me.test-game', '1.0.0', 'game.json'])).toBeUndefined();
    expect(await storage.get('files', ['me.test-game', '1.1.0', 'assets/new.txt'])).toBeDefined();
    storage.close();
  });

  it('拒绝路径穿越', async () => {
    const storage = await open();
    await expect(
      installFromZip(storage, pack({ ...baseFiles(), '../evil.js': 'bad' }), 'bad.hbx'),
    ).rejects.toBeInstanceOf(InstallError);
    storage.close();
  });

  it('拒绝不在白名单的素材', async () => {
    const storage = await open();
    await expect(
      installFromZip(storage, pack({ ...baseFiles(), 'assets/game.wasm': 'bad' }), 'bad.hbx'),
    ).rejects.toBeInstanceOf(InstallError);
    storage.close();
  });

  it('拒绝缺少 game.js 的包', async () => {
    const storage = await open();
    const files = baseFiles();
    delete files['game.js'];
    await expect(installFromZip(storage, pack(files), 'bad.hbx')).rejects.toBeInstanceOf(
      InstallError,
    );
    storage.close();
  });

  it('卸载会删除安装记录和文件', async () => {
    const storage = await open();
    await installFromZip(storage, pack(baseFiles()), 'test.hbx');
    await uninstallGame(storage, 'me.test-game');

    expect(await listInstalled(storage)).toHaveLength(0);
    expect(await storage.get('files', ['me.test-game', '1.0.0', 'game.js'])).toBeUndefined();
    storage.close();
  });
});
