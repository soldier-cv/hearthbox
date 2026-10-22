import { IDBFactory } from 'fake-indexeddb';
import { describe, expect, it } from 'vitest';
import { resolveCheats } from '../src/cheats.js';
import { clampTimeScale, parseDebugOptions } from '../src/debug.js';

describe('resolveCheats', () => {
  it('没有保存值时用默认值', () => {
    const state = resolveCheats(
      [
        { id: 'a', name: 'A', defaultEnabled: true },
        { id: 'b', name: 'B' },
      ],
      {},
    );
    expect(state.get('a')).toBe(true);
    expect(state.get('b')).toBe(false);
  });

  it('保存值优先于默认值', () => {
    const state = resolveCheats([{ id: 'a', name: 'A', defaultEnabled: true }], { a: false });
    expect(state.get('a')).toBe(false);
  });

  it('存储里多出来的 id 被忽略，不报错', () => {
    const state = resolveCheats([{ id: 'a', name: 'A' }], { removed: true, a: true });
    expect(state.get('a')).toBe(true);
    expect(state.has('removed')).toBe(false);
  });
});

describe('parseDebugOptions', () => {
  it('默认全关', () => {
    expect(parseDebugOptions('')).toEqual({});
  });

  it('解析 debug 与 seed', () => {
    expect(parseDebugOptions('?debug=1&seed=42')).toEqual({ enabled: true, seed: 42 });
  });

  it('非法 seed 被忽略', () => {
    expect(parseDebugOptions('?seed=abc')).toEqual({});
  });

  it('speed 被夹到 0.05–4', () => {
    expect(parseDebugOptions('?speed=0.01')).toEqual({ timeScale: 0.05 });
    expect(parseDebugOptions('?speed=99')).toEqual({ timeScale: 4 });
  });

  it('clampTimeScale 处理非有限值', () => {
    expect(clampTimeScale(Number.NaN)).toBe(1);
    expect(clampTimeScale(0.5)).toBe(0.5);
  });
});

describe('金手指状态跨会话持久化', () => {
  it('打开过的金手指在新会话里仍是打开的', async () => {
    const { createSession } = await import('../src/session.js');
    const { openStorage } = await import('../src/storage.js');
    const { createWebBridge } = await import('../src/web-bridge.js');
    const { createFakeSource } = await import('./fake-source.js');

    const storage = await openStorage({ factory: new IDBFactory(), name: 'cheats-test' });
    const source = createFakeSource();
    const bridge = createWebBridge({ sources: [source], lifecycle: false });
    const frameDeps = { requestFrame: () => 1, cancelFrame: () => {} };

    const stubDisplay = {
      canvas: {} as HTMLCanvasElement,
      ctx: {} as CanvasRenderingContext2D,
      width: 320,
      height: 180,
      attach: () => () => {},
      clientToLogical: (x: number, y: number) => ({ x, y }),
      setPointerMode: () => {},
    };
    const stubAudio = {
      ctx: {} as AudioContext,
      music: {} as GainNode,
      sfx: {} as GainNode,
      resume: async () => true,
      suspend: async () => {},
      setVolume: () => {},
      volume: () => 1,
      dispose: () => {},
    };

    const manifest = {
      id: 'cheat.game',
      name: 'cheat',
      version: '0.1.0',
      sdk: '^0.1.0',
      entry: 'game.js',
      display: { width: 320, height: 180, pixelArt: true, scale: 'integer' as const },
      players: { min: 1, max: 1 },
      license: 'MIT',
    };

    // 第一段：声明并打开
    const first = createSession({
      bridge,
      display: stubDisplay,
      audio: stubAudio,
      storage,
      sdkVersion: '0.1.0',
      gameId: 'cheat.game',
      ...frameDeps,
    });
    let enabledInside = false;
    await first.start({
      manifest,
      create: (ctx) => {
        ctx.cheats.declare({ id: 'inf-lives', name: '无限命' });
        enabledInside = ctx.cheats.enabled('inf-lives');
        return { update: () => {}, render: () => {} };
      },
      resolveAsset: (p) => p,
      onExit: () => {},
    });
    expect(enabledInside).toBe(false);

    first.setCheat('inf-lives', true);
    await first.stop();

    // 第二段：新会话读回打开状态
    const second = createSession({
      bridge,
      display: stubDisplay,
      audio: stubAudio,
      storage,
      sdkVersion: '0.1.0',
      gameId: 'cheat.game',
      ...frameDeps,
    });
    let restored = false;
    await second.start({
      manifest,
      create: (ctx) => {
        ctx.cheats.declare({ id: 'inf-lives', name: '无限命' });
        restored = ctx.cheats.enabled('inf-lives');
        return { update: () => {}, render: () => {} };
      },
      resolveAsset: (p) => p,
      onExit: () => {},
    });
    expect(restored).toBe(true);
    await second.stop();

    expect(second.cheats).toHaveLength(1);
    storage.close();
  });

  it('重复 id 声明抛错', async () => {
    const { createSession } = await import('../src/session.js');
    const { openStorage } = await import('../src/storage.js');
    const { createWebBridge } = await import('../src/web-bridge.js');
    const { createFakeSource } = await import('./fake-source.js');

    const storage = await openStorage({ factory: new IDBFactory(), name: 'cheat-dup' });
    const bridge = createWebBridge({ sources: [createFakeSource()], lifecycle: false });

    const session = createSession({
      bridge,
      display: {
        canvas: {} as HTMLCanvasElement,
        ctx: {} as CanvasRenderingContext2D,
        width: 320,
        height: 180,
        attach: () => () => {},
        clientToLogical: (x: number, y: number) => ({ x, y }),
        setPointerMode: () => {},
      },
      audio: {
        ctx: {} as AudioContext,
        music: {} as GainNode,
        sfx: {} as GainNode,
        resume: async () => true,
        suspend: async () => {},
        setVolume: () => {},
        volume: () => 1,
        dispose: () => {},
      },
      storage,
      sdkVersion: '0.1.0',
      gameId: 'cheat.dup',
      requestFrame: () => 1,
      cancelFrame: () => {},
    });

    await expect(
      session.start({
        manifest: {
          id: 'cheat.dup',
          name: 'dup',
          version: '0.1.0',
          sdk: '^0.1.0',
          entry: 'game.js',
          display: { width: 320, height: 180, pixelArt: true, scale: 'integer' },
          players: { min: 1, max: 1 },
          license: 'MIT',
        },
        create: (ctx) => {
          ctx.cheats.declare({ id: 'x', name: 'X' });
          ctx.cheats.declare({ id: 'x', name: 'X again' });
          return { update: () => {}, render: () => {} };
        },
        resolveAsset: (p) => p,
        onExit: () => {},
      }),
    ).rejects.toThrow('id 重复');
    await session.stop().catch(() => {});
    storage.close();
  });
});
