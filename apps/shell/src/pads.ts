import { BUTTONS } from '@hearthbox/runtime';

/**
 * M0 的手柄检测页。
 *
 * 目的只有一个：把这支手柄在 PC 上真实上报的 id、mapping、轴、按键记录下来，
 * 写进 docs/m0-findings.md。不做映射、不做归一化，原样显示。
 *
 * 节点只在插拔或轴数变化时创建，轮询帧只改文本。
 */

const root = document.querySelector<HTMLElement>('#pads');
if (!root) throw new Error('#pads not found');

interface PadView {
  box: HTMLDivElement;
  id: HTMLElement;
  mapping: HTMLElement;
  index: HTMLElement;
  axes: HTMLElement;
  buttons: HTMLElement;
  axisCells: HTMLElement[];
  buttonCells: HTMLElement[];
}

const views = new Map<number, PadView>();
let showingEmpty = false;

function render(): void {
  const pads = navigator.getGamepads ? navigator.getGamepads() : [];
  const connected: Gamepad[] = [];
  for (const pad of pads) if (pad?.connected) connected.push(pad);

  if (connected.length === 0) {
    showEmpty();
    return;
  }

  if (showingEmpty) {
    showingEmpty = false;
    root!.replaceChildren();
  }

  const live = new Set<number>();
  for (const pad of connected) {
    live.add(pad.index);
    const view = views.get(pad.index) ?? mount(pad);
    paint(pad, view);
  }

  const stale: number[] = [];
  for (const index of views.keys()) {
    if (!live.has(index)) stale.push(index);
  }
  for (const index of stale) {
    views.get(index)?.box.remove();
    views.delete(index);
  }
}

function showEmpty(): void {
  if (showingEmpty) return;
  showingEmpty = true;
  views.clear();
  root!.replaceChildren();
  const note = document.createElement('p');
  note.className = 'empty';
  note.textContent =
    '没有检测到手柄。按一下手柄上的任意键（Gamepad API 需要一次用户交互）。在电视上请改用原生桥。';
  root!.append(note);
}

function mount(pad: Gamepad): PadView {
  const box = document.createElement('div');
  box.className = 'pad';
  const id = addField(box, 'id');
  const mapping = addField(box, 'mapping');
  const index = addField(box, 'index');
  const axes = document.createElement('div');
  axes.className = 'axes';
  const buttons = document.createElement('div');
  buttons.className = 'buttons';
  box.append(axes, buttons);
  root!.append(box);

  const view: PadView = {
    box,
    id,
    mapping,
    index,
    axes,
    buttons,
    axisCells: [],
    buttonCells: [],
  };
  views.set(pad.index, view);
  return view;
}

function paint(pad: Gamepad, view: PadView): void {
  view.id.textContent = pad.id;
  view.mapping.textContent = pad.mapping || '(空)';
  view.index.textContent = String(pad.index);

  if (view.axisCells.length !== pad.axes.length) {
    view.axisCells = fillCells(view.axes, pad.axes.length);
  }
  for (let i = 0; i < pad.axes.length; i += 1) {
    const cell = view.axisCells[i];
    const axis = pad.axes[i] ?? 0;
    if (cell) cell.textContent = `${i}: ${axis.toFixed(3)}`;
  }

  if (view.buttonCells.length !== pad.buttons.length) {
    view.buttonCells = fillCells(view.buttons, pad.buttons.length);
  }
  for (let i = 0; i < pad.buttons.length; i += 1) {
    const cell = view.buttonCells[i];
    const button = pad.buttons[i];
    if (!cell || !button) continue;
    cell.textContent = `${i}: ${button.pressed ? '●' : '○'} ${button.value.toFixed(2)}`;
    cell.className = button.pressed ? 'pressed' : '';
  }
}

function addField(box: HTMLElement, label: string): HTMLElement {
  const row = document.createElement('div');
  const name = document.createElement('strong');
  name.textContent = label;
  const value = document.createElement('span');
  value.className = 'value';
  row.append(name, document.createTextNode(' '), value);
  box.append(row);
  return value;
}

function fillCells(parent: HTMLElement, count: number): HTMLElement[] {
  parent.replaceChildren();
  const cells: HTMLElement[] = [];
  for (let i = 0; i < count; i += 1) {
    const cell = document.createElement('span');
    parent.append(cell);
    cells.push(cell);
  }
  return cells;
}

function tick(): void {
  render();
  requestAnimationFrame(tick);
}

const legend = document.createElement('p');
legend.className = 'hint';
legend.textContent = `运行时按钮位序：${BUTTONS.map((button, index) => `${index}=${button}`).join(' ')}`;
root.parentElement?.appendChild(legend);

tick();
