import { render, type FunctionComponent } from 'preact';
import {
  createGamepadSource,
  createInput,
  createKeyboardSource,
  createLoop,
} from '@hearthbox/runtime';
import { createNavTracker } from './nav.js';

/**
 * 游戏内系统菜单。
 *
 * 电视上没有鼠标，所以 Esc 只是辅助路径。主路径是方向键选、A 确认、
 * B 返回；键盘与遥控器通过运行时映射走同一条 PadState。
 *
 * 菜单不自己建输入源：游戏会话已经暂停，但它的 InputSource 仍在运行，
 * 由宿主每帧把 P1 喂给 `tick`。这样不会出现两套监听抢事件。
 */

export interface MenuAction {
  id: string;
  label: string;
  hint?: string;
  run(): void;
}

interface MenuProps {
  actions: MenuAction[];
  index: number;
  onIndex(index: number): void;
  onAccept(): void;
  onBack(): void;
}

const SystemMenu: FunctionComponent<MenuProps> = ({
  actions,
  index,
  onIndex,
  onAccept,
  onBack,
}) => (
  <div class="menu-host" data-nav>
    <div class="menu-panel" role="dialog" aria-label="系统菜单">
      <header class="menu-head">
        <p class="eyebrow">Hearthbox</p>
        <h2>游戏菜单</h2>
      </header>
      <ul class="menu-list">
        {actions.map((action, i) => (
          <li key={action.id}>
            <button
              type="button"
              class="menu-item"
              data-active={i === index ? 'true' : 'false'}
              aria-current={i === index ? 'true' : undefined}
              onMouseEnter={() => onIndex(i)}
              onClick={() => {
                onIndex(i);
                onAccept();
              }}
            >
              <span class="menu-label">{action.label}</span>
              {action.hint && <span class="menu-hint">{action.hint}</span>}
            </button>
          </li>
        ))}
      </ul>
      <p class="menu-foot">方向键选择 · A / Enter 确认 · B / Esc 返回</p>
      <p class="menu-foot menu-foot-quiet">
        <button type="button" class="menu-back" onClick={onBack}>
          返回游戏
        </button>
      </p>
    </div>
  </div>
);

export function mountSystemMenu(
  container: HTMLElement,
  actions: MenuAction[],
  onBack: () => void,
): () => void {
  let index = 0;
  let open = true;
  let loop: ReturnType<typeof createLoop> | null = null;
  const nav = createNavTracker();
  const sources = [createGamepadSource(), createKeyboardSource()];
  for (const source of sources) source.start();
  const input = createInput({ sources });

  const close = (): void => {
    if (!open) return;
    open = false;
    loop?.stop();
    for (const source of sources) source.stop();
    window.removeEventListener('keydown', onKey);
    render(null, container);
    container.hidden = true;
    container.replaceChildren();
  };

  const run = (action: MenuAction | undefined): void => {
    close();
    action?.run();
  };

  const back = (): void => {
    close();
    onBack();
  };

  const onKey = (event: KeyboardEvent): void => {
    if (event.code !== 'Escape' && event.code !== 'BrowserBack') return;
    event.preventDefault();
    back();
  };
  window.addEventListener('keydown', onKey);

  function draw(): void {
    if (!open) return;
    render(
      <SystemMenu
        actions={actions}
        index={index}
        onIndex={(next) => {
          index = next;
          draw();
        }}
        onAccept={() => run(actions[index])}
        onBack={back}
      />,
      container,
    );
  }

  loop = createLoop({
    update() {
      if (!open) return;
      input.sample();
      const pad = input.players()[0];
      if (!pad || !pad.connected) return;
      const step = nav.step(pad);
      if (step.key === 'up' && actions.length > 0) {
        index = (index - 1 + actions.length) % actions.length;
        draw();
      } else if (step.key === 'down' && actions.length > 0) {
        index = (index + 1) % actions.length;
        draw();
      } else if (step.key === 'accept') {
        run(actions[index]);
      } else if (step.key === 'back') {
        back();
      }
    },
    render() {},
  });

  container.hidden = false;
  draw();
  loop.start();
  return close;
}
