import { IDBFactory } from 'fake-indexeddb';
import { beforeEach, describe, expect, it } from 'vitest';
import { createAudio } from '../src/audio.js';
import { createDisplay } from '../src/display.js';
import { createFakeSource } from './fake-source.js';
import { createWebBridge } from '../src/web-bridge.js';
import { createSession } from '../src/session.js';
import { openStorage } from '../src/storage.js';
import type { GameContext, GameInstance } from '@hearthbox/sdk';

/**
 * 会话层测试：不碰真实 DOM，画布与音频用最小桩。
 * 重点验证"存档按 [gameId, key] 复合键读写"与"退出时立刻落盘"。
 */

function stubDisplay(): ReturnType<typeof createDisplay> {
  const calls: Array<[number, number]> = [];
  const ctx = {
    setTransform: () => {},
    fillRect: () => {},
    imageSmoothingEnabled: true,
  } as unknown as CanvasRenderingContext2D;

  return {
    canvas: {} as HTMLCanvasElement,
    ctx: {
      ...ctx,
      fillRect: (x: number, y: number) => calls.push([x, y]),
    } as unknown as CanvasRenderingContext2D,
    width: 320,
    height: 180,
    attach: () => () => {},
    clientToLogical: (x: number, y: number) => ({ x, y }),
    setPointerMode: () => {},
  };
}

function stubAudio(): ReturnType<typeof createAudio> {
  return {
    ctx: { decodeAudioData: async () => ({}) } as unknown as AudioContext,
    music: {} as GainNode,
    sfx: {} as GainNode,
    resume: async () => true,
    suspend: async () => {},
    setVolume: () => {},
    volume: () => 1,
    dispose: () => {},
  };
}

describe('createSession', () => {
  let storage: Awaited<ReturnType<typeof openStorage>>;

  beforeEach(async () => {
    storage = await openStorage({ factory: new IDBFactory(), name: `session-${Math.random()}` });
  });

  /** Node 里没有 rAF；会话层用注入的帧源，测试不推进即不跑帧。 */
  function frameDeps() {
    return {
      requestFrame: (): number => 1,
      cancelFrame: (): void => {},
    };
  }

  it('存档用 [gameId, key] 复合键，跨会话能读回', async () => {
    const source = createFakeSource();
    const bridge = createWebBridge({ sources: [source], lifecycle: false });
    const state = { x: 10, y: 20 };

    const first = createSession({
      bridge,
      display: stubDisplay(),
      audio: stubAudio(),
      storage,
      sdkVersion: '0.1.0',
      gameId: 'test.game',
      ...frameDeps(),
    });

    let written: unknown;
    await first.start({
      manifest: manifestFor('test.game'),
      create(ctx: GameContext): GameInstance {
        ctx.storage.set('state', state);
        written = ctx.storage.get('state');
        return { update: () => {}, render: () => {} };
      },
      resolveAsset: (path) => path,
      onExit: () => {},
    });
    await first.stop();

    expect(written).toEqual(state);
    // 键必须是数组，不是字符串
    const keys = await storage.keys('saves');
    expect(keys).toContainEqual(['test.game', 'state']);

    // 新会话读回同一份
    const second = createSession({
      bridge,
      display: stubDisplay(),
      audio: stubAudio(),
      storage,
      sdkVersion: '0.1.0',
      gameId: 'test.game',
      ...frameDeps(),
    });
    let restored: unknown;
    await second.start({
      manifest: manifestFor('test.game'),
      create(ctx: GameContext): GameInstance {
        restored = ctx.storage.get('state');
        return { update: () => {}, render: () => {} };
      },
      resolveAsset: (path) => path,
      onExit: () => {},
    });
    await second.stop();

    expect(restored).toEqual(state);
  });

  it('不同游戏的存档互不可见', async () => {
    const source = createFakeSource();
    const bridge = createWebBridge({ sources: [source], lifecycle: false });

    const a = createSession({
      bridge,
      display: stubDisplay(),
      audio: stubAudio(),
      storage,
      sdkVersion: '0.1.0',
      gameId: 'game.a',
      ...frameDeps(),
    });
    await a.start({
      manifest: manifestFor('game.a'),
      create(ctx: GameContext): GameInstance {
        ctx.storage.set('score', 42);
        return { update: () => {}, render: () => {} };
      },
      resolveAsset: (path) => path,
      onExit: () => {},
    });
    await a.stop();

    const b = createSession({
      bridge,
      display: stubDisplay(),
      audio: stubAudio(),
      storage,
      sdkVersion: '0.1.0',
      gameId: 'game.b',
      ...frameDeps(),
    });
    let leaked: unknown;
    await b.start({
      manifest: manifestFor('game.b'),
      create(ctx: GameContext): GameInstance {
        leaked = ctx.storage.get('score');
        return { update: () => {}, render: () => {} };
      },
      resolveAsset: (path) => path,
      onExit: () => {},
    });
    await b.stop();

    expect(leaked).toBeUndefined();
  });

  it('stop 时立刻落盘，不等节流窗口', async () => {
    const source = createFakeSource();
    const bridge = createWebBridge({ sources: [source], lifecycle: false });
    const session = createSession({
      bridge,
      display: stubDisplay(),
      audio: stubAudio(),
      storage,
      sdkVersion: '0.1.0',
      gameId: 'test.flush',
      ...frameDeps(),
    });

    await session.start({
      manifest: manifestFor('test.flush'),
      create(ctx: GameContext): GameInstance {
        ctx.storage.set('progress', { level: 3 });
        return { update: () => {}, render: () => {} };
      },
      resolveAsset: (path) => path,
      onExit: () => {},
    });

    // 没有等待节流时间就 stop，值仍应已经写进 IndexedDB
    await session.stop();
    expect(await storage.get('saves', ['test.flush', 'progress'])).toEqual({ level: 3 });
  });

  it('exit() 走宿主回调', async () => {
    const source = createFakeSource();
    const bridge = createWebBridge({ sources: [source], lifecycle: false });
    let exited = false;
    const session = createSession({
      bridge,
      display: stubDisplay(),
      audio: stubAudio(),
      storage,
      sdkVersion: '0.1.0',
      gameId: 'test.exit',
      ...frameDeps(),
    });

    await session.start({
      manifest: manifestFor('test.exit'),
      create(ctx: GameContext): GameInstance {
        ctx.exit();
        return { update: () => {}, render: () => {} };
      },
      resolveAsset: (path) => path,
      onExit: () => {
        exited = true;
      },
    });
    await session.stop();
    expect(exited).toBe(true);
  });

  it('重复 start / stop 不报错', async () => {
    const source = createFakeSource();
    const bridge = createWebBridge({ sources: [source], lifecycle: false });
    const session = createSession({
      bridge,
      display: stubDisplay(),
      audio: stubAudio(),
      storage,
      sdkVersion: '0.1.0',
      gameId: 'test.idem',
      ...frameDeps(),
    });
    const options = {
      manifest: manifestFor('test.idem'),
      create: (): GameInstance => ({ update: () => {}, render: () => {} }),
      resolveAsset: (path: string) => path,
      onExit: () => {},
    };

    await session.start(options);
    await session.start(options);
    await session.stop();
    await session.stop();
    expect(session.running).toBe(false);
  });
});

function manifestFor(id: string) {
  return {
    id,
    name: id,
    version: '0.1.0',
    sdk: '^0.1.0',
    entry: 'game.js',
    display: { width: 320, height: 180, pixelArt: true, scale: 'integer' as const },
    players: { min: 1, max: 1 },
    license: 'MIT',
  };
}
