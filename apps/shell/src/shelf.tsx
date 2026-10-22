import { render, type FunctionComponent } from 'preact';
import { useCallback, useEffect, useState } from 'preact/hooks';
import { localFixtures, describeInputs, type ShelfEntry } from './fixtures.js';

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
  const [focused, setFocused] = useState(0);
  const entries = localFixtures;

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
      {entries.length === 0 ? (
        <p class="empty">
          还没有可玩的游戏。开发时先运行 <code>pnpm dev</code>
          ，夹具会自动出现在这里；安装正式游戏要等 M2。
        </p>
      ) : (
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
