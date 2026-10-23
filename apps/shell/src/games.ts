import { listInstalled, type Storage } from '@hearthbox/runtime';

/**
 * 货架内容。
 *
 * 开发期从 `/shelf.json` 读工作区里的游戏；已安装的游戏从 IndexedDB 的
 * `installs` 读。两者在货架上合并，来源不同，启动路径也不同。
 */
export interface GameEntry {
  id: string;
  name: string;
  summary: string;
  /** 这个游戏接受哪些输入，货架上会标出来。 */
  inputs: readonly ('pad' | 'keyboard' | 'pointer')[];
  /** 开发期游戏的网关目录；已安装游戏为空。 */
  base: string;
  source: 'dev' | 'installed';
  version?: string;
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
  if (!Array.isArray(payload.games)) return [];
  return payload.games.map((game) => ({ ...game, source: 'dev' }));
}

/** 已安装游戏。与开发期货架合并展示。 */
export async function loadInstalled(storage: Storage): Promise<GameEntry[]> {
  const records = await listInstalled(storage);
  return records.map((record) => ({
    id: record.id,
    name: record.name,
    summary: record.summary,
    inputs: record.manifest.input ?? ['pad'],
    base: '',
    source: 'installed',
    version: record.version,
  }));
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
