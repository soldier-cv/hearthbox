/**
 * 开发期的本地夹具清单。
 *
 * M2 起这里换成 catalog 拉取 + installer；在那之前货架列出仓库里的夹具，
 * 让平台的每条输入路径都能在浏览器里真的跑一遍。
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

export const localFixtures: ShelfEntry[] = [
  {
    id: 'hearthbox.contract',
    name: '契约夹具',
    summary: '一个方块，手柄或方向键移动，南键变色，位置写进存档。',
    inputs: ['pad', 'keyboard'],
    entry: 'game.js',
    manifest: 'game.json',
    base: '/fixtures/contract',
  },
  {
    id: 'hearthbox.inputs',
    name: '输入夹具',
    summary: '鼠标点方块换色、点空白移动、滚轮改大小；键盘与手柄同时可用。',
    inputs: ['pad', 'keyboard', 'pointer'],
    entry: 'game.js',
    manifest: 'game.json',
    base: '/fixtures/inputs',
  },
];

/** 把输入种类显示成一句人话。 */
export function describeInputs(inputs: ShelfEntry['inputs']): string {
  const labels: Record<ShelfEntry['inputs'][number], string> = {
    pad: '手柄',
    keyboard: '键盘',
    pointer: '鼠标',
  };
  return inputs.map((kind) => labels[kind]).join(' · ');
}
