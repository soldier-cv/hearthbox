# 游戏模板

复制这个目录开始一个新游戏，**不要从零写**。

## 怎么用

```bash
cd hearthbox-projects
cp -r hearthbox/templates/game my-game
cd my-game
git init && git add -A && git commit -m "feat: 从模板初始化"
```

**复制完先改这几处**，然后才能写代码：

| 改什么                                | 改成                                          |
| ------------------------------------- | --------------------------------------------- |
| `game.json` 的 `id`                   | `你的名字.游戏名`，只能小写字母、数字、连字符 |
| `game.json` 的 `name` / `summary`     | 游戏名与一句话介绍                            |
| `src/main.ts` 的 `defineGame({ id })` | **必须与 `game.json` 的 id 一模一样**         |
| `package.json` 的 `name`              | 包名，如 `my-game`                            |
| `AGENTS.md`                           | 通读一遍，把内容改成你游戏的实际情况          |

`AGENTS.md` 里没有占位符——它用模板自带的小游戏作为样例填好了。
照着改成你自己的，比从空白写快，也不会漏掉必须写的东西。

```bash
pnpm install --ignore-workspace
npx vite build
cd ../hearthbox && pnpm dev
```

货架里就会出现你的游戏。

## 里面有什么

```
game/
├── AGENTS.md          这个游戏的说明：是什么、结构、规矩、怎么跑
├── game.json          清单，三处要改
├── package.json       依赖用 file: 指进平台仓库（M2 之前）
├── tsconfig.json      不 extends 平台配置，自包含
├── vite.config.ts     三个硬约束：单文件、零裸导入、chrome87
├── docs/
│   ├── pitch.md       玩法一页纸 —— 先填这个
│   ├── systems.md     系统表 —— 数值全填数字
│   ├── art.md         美术规范 —— 必须最先定
│   └── acceptance.md  验收清单 —— 每个改动后过一遍
└── src/
    ├── config.ts      所有数值集中在这里
    ├── round.ts       极简状态机：playing / won / lost
    └── main.ts        完整链路：输入→移动→碰撞→状态→存档→重开
```

## 模板游戏本身

一个限时收集：30 秒内吃掉 5 个目标。**它不是好玩的游戏，而是一条完整链路**，把这条链路跑通之后再填你自己玩法的肉。

它演示了这些平台能力：

| 能力                      | 在哪                                           |
| ------------------------- | ---------------------------------------------- |
| 三层输入（这里只用 `p1`） | `main.ts` 的移动                               |
| 固定 60Hz 更新 + 插值渲染 | 平台的 loop，游戏只管 `update(dt)`             |
| 可复现随机                | `ctx.random.float(...)`，配 `?debug=1&seed=42` |
| 存档                      | `ctx.storage.set('progress', ...)`，1 秒落盘   |
| 状态机                    | `round.ts`，防止"死了还能动"                   |
| 逻辑坐标系                | 一直用 320×180，平台负责放大                   |

## 按玩法改造的顺序

1. **先填 `docs/pitch.md`**。核心动词填不出来就不要动手。
2. **改 `docs/art.md` 的色板**，再改 `src/config.ts` 的 `colors`，两边必须一致。
3. **改 `round.ts`**：你的胜负条件是什么？`collect()` 这个名字可能不再合适。
4. **改 `main.ts`**：保留 `update` 里的状态机骨架和 `render` 里的坐标写法，替换中间的游戏逻辑。
5. **改 `config.ts`**：所有数字都进这里，不要写在逻辑里。

## 不要做的事

- 不要在 `src/` 里加 `assets/` 之外的二进制文件。
- 不要 `import` 任何第三方库后忘记检查产物：`grep -c "from '" dist/game.js` 必须是 0。
- 不要把 `game.json` 的 `id` 改成和 `defineGame({ id })` 不一致。
- 不要用 `Math.random()`，用 `ctx.random`。

## M2 之后

`hbx create <名字>` 会替代手动复制。`package.json` 里的 `file:` 依赖换成 npm 版本号。
