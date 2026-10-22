import { BUTTONS, createRawDeviceState } from '@hearthbox/runtime';

/**
 * M0 的手柄检测页。
 *
 * 目的只有一个：把这支手柄在 PC 上真实上报的 id、mapping、轴、按键记录下来，
 * 写进 docs/m0-findings.md。不做映射、不做归一化，原样显示。
 */

const container = document.querySelector<HTMLElement>('#pads');
if (!container) throw new Error('#pads not found');

const raw = createRawDeviceState();

function render(): void {
  const pads = navigator.getGamepads ? navigator.getGamepads() : [];
  const connected: Gamepad[] = [];
  for (const pad of pads) if (pad?.connected) connected.push(pad);

  if (connected.length === 0) {
    container!.innerHTML =
      '<p class="empty">没有检测到手柄。按一下手柄上的任意键（Gamepad API 需要一次用户交互）。在电视上请改用原生桥。</p>';
    return;
  }

  container!.innerHTML = '';
  for (const pad of connected) {
    const box = document.createElement('div');
    box.className = 'pad';

    const axes = pad.axes
      .map((value, index) => `${index}: <span class="value">${value.toFixed(3)}</span>`)
      .join(' ');
    const buttons = pad.buttons
      .map((button, index) => `${index}: ${button.pressed ? '●' : '○'} ${button.value.toFixed(2)}`)
      .join(' ');

    box.innerHTML = `
      <div><strong>id</strong> ${escapeHtml(pad.id)}</div>
      <div><strong>mapping</strong> ${pad.mapping || '(空)'}</div>
      <div><strong>index</strong> ${pad.index}</div>
      <div class="axes">${axes}</div>
      <div class="buttons">${buttons}</div>
    `;
    container!.appendChild(box);
  }
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (char) => {
    switch (char) {
      case '&':
        return '&amp;';
      case '<':
        return '&lt;';
      case '>':
        return '&gt;';
      case '"':
        return '&quot;';
      default:
        return '&#39;';
    }
  });
}

function tick(): void {
  render();
  requestAnimationFrame(tick);
}

// 顺带把运行时的按钮位序打印出来，方便对照 Android keycode。
const legend = document.createElement('p');
legend.className = 'hint';
legend.textContent = `运行时按钮位序：${BUTTONS.map((button, index) => `${index}=${button}`).join(' ')}`;
container.parentElement?.appendChild(legend);

void raw;
tick();
