import { render, type FunctionComponent } from 'preact';
import { useEffect, useState } from 'preact/hooks';
import type { OptionDefinition, OptionScope } from '@hearthbox/sdk';
import {
  createGamepadSource,
  createInput,
  createKeyboardSource,
  createLoop,
  type Session,
} from '@hearthbox/runtime';
import { createNavTracker } from './nav.js';
import { actionFor, applyChange } from './panel-nav.js';

/**
 * 可调项面板。
 *
 * 一套 UI 覆盖三类：金手指、设置、只读状态。
 * 内容全部来自游戏声明的 `OptionDefinition`，平台不写死任何一条。
 * 游戏加一个 declare()，对应面板立刻多一行。
 */

interface PanelProps {
  session: Session;
  scope: OptionScope;
  title: string;
  onClose: () => void;
  active: number;
  onHover(index: number): void;
}

/** 把数值对齐到 step。 */
function snap(value: number, min: number, step: number): number {
  if (step <= 0) return value;
  return min + Math.round((value - min) / step) * step;
}

const BooleanRow: FunctionComponent<{
  definition: OptionDefinition;
  value: boolean;
  onChange: (next: boolean) => void;
}> = ({ definition, value, onChange }) => (
  <div class="cheat-row">
    <label class="cheat-toggle">
      <input
        type="checkbox"
        checked={value}
        onChange={(event) => onChange((event.target as HTMLInputElement).checked)}
      />
      <span class="cheat-name">{definition.name}</span>
    </label>
    {definition.description && <p class="cheat-desc">{definition.description}</p>}
  </div>
);

const NumberRow: FunctionComponent<{
  definition: Extract<OptionDefinition, { kind: 'number' }>;
  value: number;
  onChange: (next: number) => void;
}> = ({ definition, value, onChange }) => (
  <div class="cheat-row">
    <div class="cheat-label">
      <span class="cheat-name">{definition.name}</span>
      <span class="cheat-value">
        {value}
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
      value={value}
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

const ChoiceRow: FunctionComponent<{
  definition: Extract<OptionDefinition, { kind: 'choice' }>;
  value: string;
  onChange: (next: string) => void;
}> = ({ definition, value, onChange }) => (
  <div class="cheat-row">
    <div class="cheat-label">
      <span class="cheat-name">{definition.name}</span>
    </div>
    {definition.description && <p class="cheat-desc">{definition.description}</p>}
    <div class="cheat-choices">
      {definition.choices.map((choice) => (
        <button
          key={choice.value}
          type="button"
          class="cheat-choice"
          aria-pressed={choice.value === value}
          onClick={() => onChange(choice.value)}
        >
          {choice.label}
        </button>
      ))}
    </div>
  </div>
);

const OptionRow: FunctionComponent<{
  definition: OptionDefinition;
  session: Session;
  active: boolean;
  onHover: () => void;
}> = ({ definition, session, active, onHover }) => {
  const current = session.getOption(definition.id);
  const readOnly = (definition.scope ?? 'cheat') === 'status';

  if (readOnly) {
    return (
      <div
        class="cheat-row cheat-readonly"
        data-active={active ? 'true' : 'false'}
        onMouseEnter={onHover}
      >
        <div class="cheat-label">
          <span class="cheat-name">{definition.name}</span>
          <span class="cheat-value">{String(current ?? '')}</span>
        </div>
        {definition.description && <p class="cheat-desc">{definition.description}</p>}
      </div>
    );
  }

  if (definition.kind === 'number') {
    return (
      <div class="cheat-slot" data-active={active ? 'true' : 'false'} onMouseEnter={onHover}>
        <NumberRow
          definition={definition}
          value={typeof current === 'number' ? current : definition.defaultValue}
          onChange={(next) => session.setOption(definition.id, next)}
        />
      </div>
    );
  }

  if (definition.kind === 'choice') {
    return (
      <div class="cheat-slot" data-active={active ? 'true' : 'false'} onMouseEnter={onHover}>
        <ChoiceRow
          definition={definition}
          value={typeof current === 'string' ? current : definition.defaultValue}
          onChange={(next) => session.setOption(definition.id, next)}
        />
      </div>
    );
  }

  return (
    <div class="cheat-slot" data-active={active ? 'true' : 'false'} onMouseEnter={onHover}>
      <BooleanRow
        definition={definition}
        value={current === true}
        onChange={(next) => session.setOption(definition.id, next)}
      />
    </div>
  );
};

export const OptionPanel: FunctionComponent<PanelProps> = ({
  session,
  scope,
  title,
  onClose,
  active,
  onHover,
}) => {
  const [version, setVersion] = useState(0);

  useEffect(() => {
    // 游戏可能异步 declare，订阅变化强制重绘。
    const unsubscribe = session.onOptionsChange(() => setVersion((v) => v + 1));
    return unsubscribe;
  }, [session]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.code === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  const items = session.optionsOf(scope);

  // 索引夹住，项数随游戏 declare 变化时不会越界。
  const activeIndex = items.length === 0 ? 0 : Math.min(active, items.length - 1);

  return (
    <div class="cheat-panel" data-scope={scope} data-version={version}>
      <header class="cheat-header">
        <h2>{title}</h2>
        <button type="button" class="cheat-close" onClick={onClose}>
          关闭
        </button>
      </header>

      {items.length === 0 ? (
        <p class="cheat-empty">这个游戏没有提供{title}。</p>
      ) : (
        <div class="cheat-list" role="listbox" aria-label={title}>
          {items.map((definition, index) => (
            <OptionRow
              key={definition.id}
              definition={definition}
              session={session}
              active={index === activeIndex}
              onHover={() => onHover(index)}
            />
          ))}
        </div>
      )}

      <p class="cheat-foot">方向键选择 · 左右改值 · A 切换 · B 返回</p>
    </div>
  );
};

/** 挂载到容器。返回卸载函数。 */
export function mountOptionPanel(
  container: HTMLElement,
  session: Session,
  scope: OptionScope,
  title: string,
  onClosed?: () => void,
): () => void {
  let active = 0;
  let closed = false;
  let loop: ReturnType<typeof createLoop> | null = null;
  const nav = createNavTracker();
  const sources = [createGamepadSource(), createKeyboardSource()];
  for (const source of sources) source.start();
  const input = createInput({ sources });

  const draw = (): void => {
    if (closed) return;
    render(
      <OptionPanel
        session={session}
        scope={scope}
        title={title}
        active={active}
        onHover={(index) => {
          active = index;
          draw();
        }}
        onClose={close}
      />,
      container,
    );
  };

  const close = (): void => {
    if (closed) return;
    closed = true;
    loop?.stop();
    for (const source of sources) source.stop();
    render(null, container);
    container.hidden = true;
    container.replaceChildren();
    session.resume();
    onClosed?.();
  };

  loop = createLoop({
    update() {
      if (closed) return;
      input.sample();
      const pad = input.players()[0];
      if (!pad || !pad.connected) return;
      const items = session.optionsOf(scope);
      if (items.length === 0) return;
      const step = nav.step(pad);
      if (!step.key) return;
      active = Math.min(active, items.length - 1);
      const current = items[active];

      if (step.key === 'up') {
        active = (active - 1 + items.length) % items.length;
        draw();
        return;
      }
      if (step.key === 'down') {
        active = (active + 1) % items.length;
        draw();
        return;
      }
      if (step.key === 'back') {
        close();
        return;
      }
      if (!current) return;
      const change =
        step.key === 'accept'
          ? actionFor(current, 'accept')
          : step.key === 'left' || step.key === 'right'
            ? actionFor(current, step.key)
            : null;
      if (change) applyChange(session, current, change);
    },
    render() {},
  });

  container.hidden = false;
  draw();
  loop.start();
  return close;
}
