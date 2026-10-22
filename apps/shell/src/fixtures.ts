/**
 * 开发期货架：从 /fixtures/index.json 读清单。
 *
 * 为什么不在代码里写死：写死意味着每加一个游戏都要改平台源码、重启 dev server，
 * 而游戏本应独立于平台。M2 的 catalog 走的是同一个思路——货架内容是可替换的数据，
 * 不是编译进壳的常量。这里只是把数据源换成开发目录下的一份 JSON。
 */
export interface ShelfEntry {
  id: string;
  name: string;
  summary: string;
  /** 这个游戏接受哪些输入，货架据此显示标识。 */
  inputs: readonly ('pad' | 'keyboard' | 'pointer')[];
  /** 包内入口，相对包目录。 */
  entry: string;
  /** 包清单，相对包目录。 */
  manifest: string;
  /** 包目录，宿主用它拼资源 URL。 */
  base: string;
}

interface FixtureIndex {
  fixtures: ShelfEntry[];
}

export async function loadFixtures(): Promise<ShelfEntry[]> {
  const response = await fetch('/fixtures/index.json', { cache: 'no-store' });
  if (!response.ok) {
    if (response.status === 404) return [];
    throw new Error(`读取货架清单失败：${response.status}`);
  }
  const index = (await response.json()) as FixtureIndex;
  return Array.isArray(index.fixtures) ? index.fixtures : [];
}

/** 把输入种类显示成一句人话。 */
export function describeInputs(inputs: ShelfEntry['inputs']): string {
  const labels: Record<ShelfEntry['inputs'][number], string> = {
    pad: '手柄',
    keyboard: '键盘',
    pointer: '鼠标',
  };
  return inputs.map((kind) => labels[kind]).join(' · ');
}
