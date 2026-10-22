/**
 * M1 的本地夹具清单。
 *
 * M2 起这里换成 catalog 拉取 + installer；在那之前货架只需要"能进入夹具"，
 * 不假装已经有安装能力。夹具是静态目录，由 Vite 直接提供。
 */
export interface ShelfEntry {
  id: string;
  name: string;
  summary: string;
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
    summary: '一个方块，摇杆移动，按键变色，位置写进存档。',
    entry: 'game.js',
    manifest: 'game.json',
    base: '/fixtures/contract',
  },
];
