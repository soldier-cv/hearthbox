import { render, type FunctionComponent } from 'preact';
import { useEffect, useState } from 'preact/hooks';
import type { CheatDefinition } from '@hearthbox/sdk';
import type { Session } from '@hearthbox/runtime';

/**
 * 金手指面板。
 *
 * 数据全部来自游戏自己声明的 `CheatDefinition`，平台不写死任何一条。
 * 游戏加一个 declare()，面板立刻多一行 —— 这就是"自动暴露"。
 *
 * 两种控件：
 * - boolean → 开关
 * - number  → 滑杆，范围与步进来自声明
 */

interface PanelProps {
  session: Session;
  onClose: () => void;
}

/** 把数值对齐到 step，向下取也可以，这里用四舍五入更符合直觉。 */
function snap(value: number, min: number, step: number): number {
  if (step <= 0) return value;
  return min + Math.round((value - min) / step) * step;
}

const CheatRow: FunctionComponent<{
  definition: CheatDefinition;
  value: boolean | number;
  onChange: (next: boolean | number) => void;
}> = ({ definition, value, onChange }) => {
  if (definition.kind === 'number') {
    const current = typeof value === 'number' ? value : definition.defaultValue;
    return (
      <div class="cheat-row">
        <div class="cheat-label">
          <span class="cheat-name">{definition.name}</span>
          <span class="cheat-value">
            {current}
            {definition.unit ?? ''}
          </span>
        </div>
        {definition.description && <p class="cheat-desc">{definition.description}</p>}
        <input
          class="cheat-slider"
          type="range"
          min={definition.min}
          max={definition.max}
          step={definition.step}
          value={current}
          onInput={(event) => {
            const raw = Number((event.target as HTMLInputElement).value);
            onChange(snap(raw, definition.min, definition.step));
          }}
        />
        <div class="cheat-range">
          <span>
            {definition.min}
            {definition.unit ?? ''}
          </span>
          <span>
            {definition.max}
            {definition.unit ?? ''}
          </span>
        </div>
      </div>
    );
  }

  const on = value === true;
  return (
    <div class="cheat-row">
      <label class="cheat-toggle">
        <input
          type="checkbox"
          checked={on}
          onChange={(event) => onChange((event.target as HTMLInputElement).checked)}
        />
        <span class="cheat-name">{definition.name}</span>
      </label>
      {definition.description && <p class="cheat-desc">{definition.description}</p>}
    </div>
  );
};

export const CheatPanel: FunctionComponent<PanelProps> = ({ session, onClose }) => {
  const [version, setVersion] = useState(0);
  const cheats = session.cheats;

  useEffect(() => {
    // 游戏可能在 create 之后才 declare（异步加载时），订阅变化强制重绘。
    const unsubscribe = session.onCheatsChange(() => setVersion((v) => v + 1));
    return unsubscribe;
  }, [session]);

  useEffect(() => {
    // Esc 关闭；手柄 start 也关闭。
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.code === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  return (
    <div class="cheat-panel" data-version={version}>
      <header class="cheat-header">
        <h2>金手指</h2>
        <button type="button" class="cheat-close" onClick={onClose}>
          关闭
        </button>
      </header>

      {cheats.length === 0 ? (
        <p class="cheat-empty">这个游戏没有提供金手指。</p>
      ) : (
        <div class="cheat-list">
          {cheats.map((definition) => (
            <CheatRow
              key={definition.id}
              definition={definition}
              value={session.getCheat(definition.id) ?? false}
              onChange={(next) => session.setCheat(definition.id, next)}
            />
          ))}
        </div>
      )}
    </div>
  );
};

/** 挂载到宿主页里的容器。返回卸载函数。 */
export function mountCheatPanel(
  container: HTMLElement,
  session: Session,
  onClosed?: () => void,
): () => void {
  /** 卸载面板并通知调用方。 */
  const unmount = (): void => {
    render(null, container);
    container.hidden = true;
    container.replaceChildren();
    session.resume();
    onClosed?.();
  };

  container.hidden = false;
  render(<CheatPanel session={session} onClose={unmount} />, container);

  return unmount;
}
