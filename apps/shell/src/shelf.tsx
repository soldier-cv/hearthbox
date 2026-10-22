import { render, type FunctionComponent } from 'preact';
import { useEffect, useState } from 'preact/hooks';
import { describeInputs, loadGames, type GameEntry } from './games.js';

/**
 * 货架。
 *
 * 内容从 /shelf.json 读，所以工作区里新增游戏目录后会自己出现，
 * 不需要改这里的代码。
 */

function enter(entry: GameEntry): void {
  // 整页跳转到宿主，不是游戏目录：D6 要求每次会话是一个新文档。
  const query = new URLSearchParams({ id: entry.id, base: entry.base });
  location.assign(`/play.html?${query.toString()}`);
}

const GameCard: FunctionComponent<{
  entry: GameEntry;
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
  const [entries, setEntries] = useState<GameEntry[]>([]);
  const [focused, setFocused] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    void loadGames()
      .then(setEntries)
      .catch((cause: unknown) => setError(cause instanceof Error ? cause.message : String(cause)))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      if (entries.length === 0) return;
      if (event.code === 'ArrowRight' || event.code === 'ArrowDown') {
        event.preventDefault();
        setFocused((current) => (current + 1) % entries.length);
      } else if (event.code === 'ArrowLeft' || event.code === 'ArrowUp') {
        event.preventDefault();
        setFocused((current) => (current - 1 + entries.length) % entries.length);
      } else if (event.code === 'Enter') {
        const entry = entries[focused];
        if (entry) enter(entry);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [entries, focused]);

  return (
    <main class="shelf">
      <h1>炉边</h1>
      <p class="subtitle">手柄优先。Enter 或 A 键确认。</p>

      {error !== null && <p class="empty">读取货架失败：{error}</p>}
      {loading && <p class="empty">正在读取货架…</p>}

      {!loading && error === null && entries.length === 0 && (
        <p class="empty">还没有可玩的游戏。</p>
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
if (!root) throw new Error('#app 不存在');
render(<Shelf />, root);
