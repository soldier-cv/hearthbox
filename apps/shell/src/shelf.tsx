import { render, type FunctionComponent } from 'preact';
import { useCallback, useEffect, useState } from 'preact/hooks';
import { describeInputs, loadFixtures, type ShelfEntry } from './fixtures.js';

/**
 * 货架的最小版本（M1）。
 *
 * D10 决定 UI 用 Preact，M3 会在这上面加详情页、设置页和真正的空间导航。
 * 现在只有一列卡片 + 上下键移动焦点，够验证"只用键盘能进游戏"。
 */

function enter(entry: ShelfEntry): void {
  // 整页跳转到宿主，不是游戏目录：D6 要求每次会话是一个新文档。
  const query = new URLSearchParams({
    id: entry.id,
    base: entry.base,
    entry: entry.entry,
    manifest: entry.manifest,
  });
  location.assign(`/play.html?${query.toString()}`);
}

const GameCard: FunctionComponent<{
  entry: ShelfEntry;
  focused: boolean;
  onFocus: () => void;
  onEnter: () => void;
}> = ({ entry, focused, onFocus, onEnter }) => (
  <li
    class="game-card"
    data-focused={focused ? 'true' : 'false'}
    tabIndex={0}
    onFocus={onFocus}
    onMouseEnter={onFocus}
    onClick={onEnter}
  >
    <h2>{entry.name}</h2>
    <p>{entry.summary}</p>
    <p class="inputs">{describeInputs(entry.inputs)}</p>
    <button
      type="button"
      onClick={(event) => {
        event.stopPropagation();
        onEnter();
      }}
    >
      开始
    </button>
  </li>
);

const Shelf: FunctionComponent = () => {
  const [entries, setEntries] = useState<ShelfEntry[]>([]);
  const [focused, setFocused] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    void loadFixtures()
      .then((loaded) => setEntries(loaded))
      .catch((cause: unknown) => setError(cause instanceof Error ? cause.message : String(cause)))
      .finally(() => setLoading(false));
  }, []);

  const move = useCallback(
    (delta: number) => {
      if (entries.length === 0) return;
      setFocused((current) => (current + delta + entries.length) % entries.length);
    },
    [entries.length],
  );

  useEffect(() => {
    // 方向键在货架里移动焦点，Enter 进入。M3 会换成空间焦点算法。
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.code === 'ArrowRight' || event.code === 'ArrowDown') {
        event.preventDefault();
        move(1);
      } else if (event.code === 'ArrowLeft' || event.code === 'ArrowUp') {
        event.preventDefault();
        move(-1);
      } else if (event.code === 'Enter') {
        const entry = entries[focused];
        if (entry) enter(entry);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [entries, focused, move]);

  return (
    <main class="shelf">
      <h1>炉边</h1>
      <p class="subtitle">手柄优先。Enter 或 A 键确认。</p>

      {error !== null && <p class="empty">读取货架失败：{error}</p>}

      {loading && <p class="empty">正在读取货架…</p>}

      {!loading && error === null && entries.length === 0 && (
        <p class="empty">
          还没有可玩的游戏。把你的游戏放进 <code>fixtures/&lt;名字&gt;/</code>，然后运行{' '}
          <code>pnpm fixtures</code> 重建并同步。
        </p>
      )}

      {entries.length > 0 && (
        <ul class="game-list">
          {entries.map((entry, index) => (
            <GameCard
              key={entry.id}
              entry={entry}
              focused={index === focused}
              onFocus={() => setFocused(index)}
              onEnter={() => enter(entry)}
            />
          ))}
        </ul>
      )}
    </main>
  );
};

const root = document.querySelector<HTMLElement>('#app');
if (!root) throw new Error('#app not found');
render(<Shelf />, root);
