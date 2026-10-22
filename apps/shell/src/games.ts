/**
 * 货架内容。
 *
 * 从 `/shelf.json` 读，而不是写死在代码里：这样工作区里其他游戏目录
 * 也能自动出现在货架上（网关会扫）。
 *
 * M2 有安装器之后，这个地址换成 catalog，结构不变。
 */
export interface GameEntry {
  id: string;
  name: string;
  summary: string;
  /** 这个游戏接受哪些输入，货架上会标出来。 */
  inputs: readonly ('pad' | 'keyboard' | 'pointer')[];
  /** 游戏目录，宿主用它拼入口与素材的地址。 */
  base: string;
}

interface ShelfPayload {
  games: GameEntry[];
}

export async function loadGames(): Promise<GameEntry[]> {
  const response = await fetch('/shelf.json', { cache: 'no-store' });
  if (!response.ok) {
    if (response.status === 404) return [];
    throw new Error(`读取货架失败：${response.status}`);
  }
  const payload = (await response.json()) as ShelfPayload;
  return Array.isArray(payload.games) ? payload.games : [];
}

/** 把输入种类说成人话。 */
export function describeInputs(inputs: GameEntry['inputs']): string {
  const labels: Record<GameEntry['inputs'][number], string> = {
    pad: '手柄',
    keyboard: '键盘',
    pointer: '鼠标',
  };
  return inputs.map((kind) => labels[kind]).join(' · ');
}
