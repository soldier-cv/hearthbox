import {
  createGamepadSource,
  createInput,
  createKeyboardSource,
  createLoop,
  openStorage,
  uninstallGame,
  type Storage,
} from '@hearthbox/runtime';
import { render, type FunctionComponent } from 'preact';
import { useEffect, useRef, useState } from 'preact/hooks';
import { describeInputs, loadGames, loadInstalled, type GameEntry } from './games.js';
import { createNavTracker } from './nav.js';

/**
 * 货架。
 *
 * 内容从 /shelf.json 读，所以工作区里新增游戏目录后会自己出现，
 * 不需要改这里的代码。焦点只读 P1 的 PadState：键盘映射在运行时里，
 * 方向键、摇杆、十字键走同一条路。
 */

function enter(entry: GameEntry): void {
  // 已安装游戏从 IndexedDB 读；开发期游戏从 dev server 的网关读。
  if (entry.source === 'installed') {
    const query = new URLSearchParams({ id: entry.id, source: 'installed' });
    location.assign(`/play.html?${query.toString()}`);
    return;
  }
  // 整页跳转到宿主，不是游戏目录：D6 要求每次会话是一个新文档。
  const query = new URLSearchParams({ id: entry.id, base: entry.base });
  location.assign(`/play.html?${query.toString()}`);
}

function openSaves(entry: GameEntry): void {
  const query = new URLSearchParams({
    id: entry.id,
    name: entry.name,
    version: entry.version ?? '',
  });
  location.assign(`/saves.html?${query.toString()}`);
}

const GameCard: FunctionComponent<{
  entry: GameEntry;
  focused: boolean;
  index: number;
  total: number;
  onFocus: () => void;
  onEnter: () => void;
  onRemove?: (() => void) | undefined;
}> = ({ entry, focused, index, total, onFocus, onEnter, onRemove }) => (
  <li
    class="game-card"
    data-focused={focused ? 'true' : 'false'}
    aria-current={focused ? 'true' : undefined}
    aria-posinset={index + 1}
    aria-setsize={total}
    onMouseEnter={onFocus}
    onClick={onEnter}
  >
    <div class="card-mark" aria-hidden="true">
      <span>{entry.name.slice(0, 1)}</span>
    </div>
    <div class="card-body">
      <h2>
        {entry.name}
        {entry.source === 'installed' && <span class="card-tag">已安装</span>}
      </h2>
      <p>{entry.summary}</p>
      <p class="inputs">{describeInputs(entry.inputs)}</p>
    </div>
    <div class="card-actions">
      <button
        type="button"
        class="card-play"
        tabIndex={-1}
        onClick={(event) => {
          event.stopPropagation();
          onEnter();
        }}
      >
        开始
      </button>
      <button
        type="button"
        class="card-save"
        tabIndex={-1}
        onClick={(event) => {
          event.stopPropagation();
          openSaves(entry);
        }}
      >
        存档
      </button>
      {onRemove && (
        <button
          type="button"
          class="card-remove"
          tabIndex={-1}
          onClick={(event) => {
            event.stopPropagation();
            onRemove();
          }}
        >
          删除
        </button>
      )}
    </div>
  </li>
);

const Shelf: FunctionComponent = () => {
  const [entries, setEntries] = useState<GameEntry[]>([]);
  const [focused, setFocused] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [storage, setStorage] = useState<Storage | null>(null);
  const entriesRef = useRef(entries);
  const focusedRef = useRef(focused);
  entriesRef.current = entries;
  focusedRef.current = focused;

  useEffect(() => {
    void (async () => {
      try {
        const opened = await openStorage().catch(() => null);
        setStorage(opened);
        const [dev, installed] = await Promise.all([
          loadGames(),
          opened ? loadInstalled(opened) : Promise.resolve([]),
        ]);
        setEntries([...dev, ...installed]);
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : String(cause));
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  async function refresh(store: Storage): Promise<void> {
    const [dev, installed] = await Promise.all([loadGames(), loadInstalled(store)]);
    const next = [...dev, ...installed];
    setEntries(next);
    setFocused((current) => Math.min(current, Math.max(0, next.length - 1)));
  }

  function remove(entry: GameEntry): void {
    if (!storage) return;
    if (!confirm(`删除「${entry.name}」？存档会保留。`)) return;
    void uninstallGame(storage, entry.id)
      .then(() => refresh(storage))
      .catch((cause: unknown) => setError(cause instanceof Error ? cause.message : String(cause)));
  }

  useEffect(() => {
    const sources = [createGamepadSource(), createKeyboardSource()];
    for (const source of sources) source.start();
    const input = createInput({ sources });
    const nav = createNavTracker();
    const loop = createLoop({
      update() {
        input.sample();
        const pad = input.players()[0];
        if (!pad) return;
        const step = nav.step(pad);
        if (step.key === 'accept') {
          const entry = entriesRef.current[focusedRef.current];
          if (entry) enter(entry);
          return;
        }
        if (step.key === 'select') {
          const entry = entriesRef.current[focusedRef.current];
          if (entry) openSaves(entry);
          return;
        }
        if (
          step.key !== 'down' &&
          step.key !== 'right' &&
          step.key !== 'up' &&
          step.key !== 'left'
        ) {
          return;
        }
        const count = entriesRef.current.length;
        if (count === 0) return;
        const forward = step.key === 'down' || step.key === 'right';
        const next = (focusedRef.current + (forward ? 1 : -1) + count) % count;
        focusedRef.current = next;
        setFocused(next);
      },
      render() {},
    });
    loop.start();
    return () => {
      loop.stop();
      for (const source of sources) source.stop();
    };
  }, []);

  useEffect(() => {
    const card = document.querySelector<HTMLElement>('.game-card[data-focused="true"]');
    card?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }, [focused, entries]);

  const ready = !loading && error === null;

  function focusAt(index: number): void {
    focusedRef.current = index;
    setFocused(index);
  }

  return (
    <main class="shelf">
      <header class="shelf-head">
        <div class="brand">
          <span class="brand-mark" aria-hidden="true" />
          <div>
            <p class="eyebrow">Hearthbox</p>
            <h1>炉边</h1>
          </div>
        </div>
        <p class="subtitle">方向键或摇杆移动焦点，A 或 Enter 开始。</p>
      </header>

      {error !== null && (
        <section class="notice" role="alert">
          <h2>货架没读出来</h2>
          <p>{error}</p>
        </section>
      )}

      {loading && (
        <ul class="game-list" aria-busy="true" aria-label="正在读取货架">
          <li class="game-card skeleton" />
          <li class="game-card skeleton" />
        </ul>
      )}

      {ready && entries.length === 0 && (
        <section class="notice">
          <h2>炉边还是空的</h2>
          <p>
            把游戏目录放到工作区根下，写好 <code>game.json</code> 并构建；或者
            <a href="/import.html">导入一个 .hbx</a>。
          </p>
        </section>
      )}

      {!loading && entries.length > 0 && (
        <ul class="game-list">
          {entries.map((entry, index) => (
            <GameCard
              key={entry.id}
              entry={entry}
              focused={index === focused}
              index={index}
              total={entries.length}
              onFocus={() => focusAt(index)}
              onEnter={() => enter(entry)}
              onRemove={entry.source === 'installed' ? () => remove(entry) : undefined}
            />
          ))}
        </ul>
      )}

      <footer class="shelf-foot">
        <a href="/import.html">导入游戏</a>
        <a href="/pads.html">手柄检测</a>
      </footer>
    </main>
  );
};

const root = document.querySelector<HTMLElement>('#app');
if (!root) throw new Error('#app 不存在');
render(<Shelf />, root);
