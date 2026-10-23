# Hearthbox · 炉边

手柄优先的自制游戏平台。一个壳（Android TV / Windows）+ 一份货架（catalog）+ 多份游戏包（`.hbx`）。游戏只针对 SDK 写，不针对操作系统。

本文件是给在这个仓库里工作的代理的入口。细节在 `docs/`，这里只讲边界、目录和怎么对接。改架构时在 `docs/decisions.md` 追加新记录，不要改写旧记录。

## 开工前加载的技能

| 技能 | 什么时候 |
|---|---|
| `hearthbox` | 任何在平台或游戏上的工作 |
| `2d-games` | 改运行时的显示、循环、碰撞相关部分 |
| `game-design` | 设计 SDK 契约、可调项体系时判断"游戏作者会怎么用" |
| `codebase-design` | 拆分模块、放置接口边界 |
| `tdd` | 写新模块之前 |
| `playwright-skill` / `ui-diff` | 验证壳页面与游戏画面 |

**为什么要用游戏技能改平台**：SDK 的每个决定都在约束游戏作者。
不站在游戏设计角度想，就会做出"技术上正确但没人愿意用"的接口。

## 硬性规矩（先看这几条）

违反其中任何一条都会造成难以回滚的后果：
1. **不改 origin / scheme**（`androidScheme`、hostname、Tauri scheme）。改了等于换域名，IndexedDB 里的存档与已装游戏全部丢失。见 D3。
2. **游戏包零裸导入、单文件 ESM**。SDK 也要内联。包在 blob URL 下执行，裸说明符解析不了。见 D16。
3. **画布归平台**。游戏拿 `ctx.ctx2d`，不自己 `getContext`。见 D15。
4. **存储只加不建**。升 `DB_VERSION` 并在 `onupgradeneeded` 里补建库，禁止删除重建。见 `runtime-api.md` 第 7 节。
5. **热路径不分配**。`loop` / `input` / `display` 每帧都跑，禁止每帧 new 对象。
6. **新依赖先对照 `compatibility.md` 第 6 节**。拿不准就先问。
7. **私钥、keystore、`.env` 不进仓库**。
8. **不要给不要的东西留痕**。决定不做的功能、被推翻的设计、内部旧名字，直接删掉；代码里不留兼容别名、废弃入口，文档里不写"已废弃/取代/历史"。

提交前四件事全过才算完成：`pnpm lint && pnpm typecheck && pnpm test && pnpm build`。

## 现在处于什么阶段

**M1 已完成**：运行时内核、SDK v0、货架页、宿主页都能在 PC 浏览器里跑。demo 里的演示游戏能玩，存档刷新后保留。

M0 的真机实测、M2 之后的里程碑都没做，见 `docs/roadmap.md`。不要在 M2 之前建 `packages/catalog`、`tools/hbx`、`native/android`。

关键决策见 `docs/decisions.md`（D1–D20）。实现时最容易被忽略的三条：

- **画布归平台**（D15）。`Display` 在 `attach` 时取得唯一的 2D 上下文，做好缩放、DPR 与 `imageSmoothingEnabled`。游戏拿到的是 `ctx.ctx2d`，不是可以自己再 `getContext` 的 `HTMLCanvasElement`。WebGL 以后作为可选字段加上。
- **游戏包自包含**（D16）。`game.js` 不允许任何 `import` 语句，`@hearthbox/sdk` 也内联。包入口在 blob URL 下执行，裸说明符解析不了，而 import maps 需要 Chromium 89+。
- **输入三层并存**（D17）。手柄、键盘、指针互不排斥，也不因为检测到鼠标就禁用摇杆。

## 目录

标注「M2 / M4 才创建」的目录，在对应里程碑之前不要建。

```
hearthbox/
  apps/
    shell/            # 唯一的前端应用：货架 index.html、宿主 play.html、手柄检测 pads.html
  packages/
    runtime/          # 主循环、输入、显示、音频、存储、会话、金手指、调试
    sdk/              # 只有类型和 defineGame()，发布到 npm，零运行时依赖
    catalog/          # schema、校验、签名（M2 才创建）
  native/
    android/          # Capacitor 工程与原生输入插件（M4 才创建）
  demo/               # 演示游戏：把平台每项能力都用一遍，用来确认平台正常
  templates/
    game/             # 新游戏模板：可跑通的完整链路 + 四份流程文档
  tools/
    hbx/              # CLI：create / dev / pack / sign / publish（M2 才创建）
  scripts/            # dev-server.mjs（起服务）、build-demo.mjs（构建演示游戏）
  docs/               # 架构、决策、契约。进度只改 docs/roadmap.md 的复选框
```

依赖只允许顺着箭头：

```
apps/shell → packages/runtime → packages/sdk
                    └→ packages/catalog      （M2 起）
tools/hbx → packages/catalog → packages/sdk
demo → packages/sdk
```

反向 import 禁止，包括类型导入。包之间只走 `package.json` 的 `exports`，不引用包内深层文件。`packages/sdk` 不得依赖本仓库的任何其他包。

**demo 是演示游戏**：用来确认平台每项能力都正常，不发布到 npm，也不是给人长期玩的。

## 常用命令

```bash
pnpm install
pnpm dev        # 构建演示游戏 → 起服务（127.0.0.1:5199）
pnpm test       # Vitest 单元测试
pnpm typecheck  # 全包类型检查
pnpm lint       # ESLint + Prettier
pnpm build      # 构建全部包
pnpm demo       # 只重建演示游戏

pnpm exec playwright test   # 端到端（会自己起 dev server）
```

## 游戏怎么和这套对接

游戏不进本仓库（D12）。每个游戏是**工作区根目录下的兄弟目录**，不是平台仓库里的子目录：

```
hearthbox-projects/
  hearthbox/        平台（本仓库）
  my-game/          游戏：game.json + dist/game.js
```

开发时 `pnpm dev` 会自动扫描工作区根下的所有含 `game.json` 且已 build 的目录，挂到货架上。游戏文件不复制进平台仓库，也不改平台源码。

**新游戏从 `templates/game/` 复制，不要从零写。** 模板里有一份能跑通的完整链路（输入→移动→碰撞→状态→存档→重开）和四份流程文档。

M2 之后有 `hbx create` 生成标准仓库、`hbx dev` 起独立开发服务器，那时不必放在同一父目录下。

新增游戏的完整步骤见 `docs/local-dev.md`。

### 做一款游戏的流程

不是先写代码，而是按这个顺序（详见技能 `hearthbox-game-design`）：

| 步 | 产出 | 判断标准 |
|---|---|---|
| 1 | 玩法一页纸（`docs/pitch.md`） | 核心动词只有一个，能填完八个字段 |
| 2 | 美术规范（`docs/art.md`） | 分辨率、色板 hex、网格全部写死 |
| 3 | 系统表（`docs/systems.md`） | 每行都能填进具体数字 |
| 4 | 垂直切片 | 10 分钟能玩完，每轮改动都能玩 |
| 5 | 验收（`docs/acceptance.md`） | 真跑起来并截图，`typecheck` 通过不算 |

**最容易返工的两处**：美术规范最后才定（所有素材重画）、数值散落在代码里（改一个数翻五个文件）。

文档只要这四份。实测数据显示 30 份设计文档的版本在盲评里排最后 —— 多出来的是可追溯性，不是更好的游戏。

### 数值必须可调（硬约定）

**游戏逻辑里不允许出现裸数值。** 所有会被金手指、难度、调试改的东西都走 `Tuning` 层：

```
config.ts   常量（分辨率、颜色、体积）—— 永不变
tuning.ts   可调量（速度、经验、出怪、品质）—— 金手指改这里
main.ts     只读 tuning.xxx(base)，不碰数字
```

金手指用**数值型**而不是开关型（`kind: 'number'` + `min/max/step`），平台据此生成 UI、夹取越界值、对齐步进。开关型只用于"有/无"的语义（无敌）。

四条规则：

1. 逻辑里不写裸数值
2. 金手指 `id` 发布后不改
3. 金手指只改速率，不改进度结构
4. 用了金手指的局在存档里打标记

完整说明见 `docs/tuning.md`。

货架内容（`catalog.json`、签名、`.hbx`）是发布产物，放对象存储，不进任何仓库。签名私钥只留在发布机器上。

## 游戏的语言和框架：限制什么，不限制什么

限制的是**打出来的包**，不是作者用什么写。

必须满足（`hbx pack` 会拒）：

- 产物是单个 ESM 文件，**零 `import` 语句**（`@hearthbox/sdk` 也要内联）。
- 构建 target 是 `chrome87`。禁用 API 与语法同 `docs/compatibility.md`。
- 入口符合 `defineGame()`。`update` 不碰 DOM / Canvas，`render` 只绘制。
- `game.json` 的 `id`、`version`、`sdk` 范围合法。
- 解压后 ≤ 200MB、文件数 ≤ 4000、路径无 `..`、无符号链接。
- 媒体只允许 png、jpg、webp、gif、json、txt、ogg、mp3、wav。

不限制：

- 源码语言。TypeScript 是模板默认，JavaScript、Rust→WASM 或其他能打成上述 ESM 的语言都可以。
- 渲染库。PixiJS 等由游戏自己依赖并打进包，不进平台。
- 玩法、数值、画面风格。

不要做的：

- 不要调用 `requestAnimationFrame`、用 `setTimeout` 驱动逻辑、读 `navigator.getGamepads()`、直接写 IndexedDB、把音频接到 `ctx.destination`。
- 不要把多文件模块当入口。blob URL 下解析不了相对 import。
- 不要在 `update` / `render` 里分配可以避免的对象，也不要在 `render` 里同步解码图片。

## 代码规范

写这个仓库的代码时按下面四条执行。它们不是风格偏好，是会直接影响可维护性的约束。

### 1. 代码不乱

- 一个文件一个主要职责。文件超过 300 行就该检查是否有第二件事混进来。
- 依赖顺序固定：类型 → 常量 → 主要导出 → 内部辅助。辅助函数放文件末尾。
- 不在文件中间随手定义常量或全局状态。
- 编辑器自动格式化（Prettier），不许手工对齐。
- 顺序即结构：读一个文件应该能从上到下读懂它做什么。

### 2. 不做非必要的提取

**提取只有一个理由：这段逻辑需要被独立理解、独立测试，或被两处以上复用。**

不要这样：

```ts
// 反面教材：为了"看起来短"把一行拆成函数
function addOne(n: number): number {
  return n + 1;
}
```

也不要为了过 lint 的行数限制，把一个连贯的组装函数切成 `buildA()` / `buildB()` / `buildC()` 然后拼回去。那种拆法让读者必须来回跳。

该提取的信号：

- 同一个概念出现两次以上。
- 这段逻辑有自己的状态和生命周期（如 `save-store.ts`、`cheat-store.ts`）。
- 这段逻辑可以脱离上下文单独测试（如 `deadzone.ts`）。

`max-lines-per-function` 上限是 150 行。**它是护栏，不是目标。**

### 3. 注释和代码一致

- 注释解释**为什么**，不解释代码在做什么。`// 加一` 这种注释删掉。
- 改了代码就改注释。过时的注释比没有注释更糟。
- 不写"TODO: 以后实现"——要么现在做，要么记进 `docs/roadmap.md`。
- 删掉注释掉的代码。版本控制在，不需要留着。
- 有陷阱的地方必须写清：为什么不能用更直观的写法。比如 `storage.ts` 里为什么必须 `abort()`。

### 4. 方法名不能太长

上限 24 个字符，目标在 12 个以内。

| 别扭                                   | 好                |
| -------------------------------------- | ----------------- |
| `handlePointerDownEventAndUpdateState` | `onPointerDown`   |
| `getCurrentKeyboardHeldCodesList`      | `heldCodes`       |
| `createAndInitializeSaveStoreForGame`  | `createSaveStore` |
| `isPointerCurrentlyInsideCanvasBounds` | `inside`          |

- 名字里不要带类型（`xxxList`、`xxxMap`、`xxxString`）。
- 不要用 `handle` / `process` / `do` 开头，直接说做了什么。
- 布尔用 `is` / `has` / `can` 开头，读起来是句子：`isRunning`、`hasFocus`。
- 名字太长通常说明这个函数做了两件事。

## 平台侧规范

- 兼容基线 Chromium 87。基线以上的 API 必须同时有检测和降级，否则不要用。
- `packages/runtime` 的循环、输入、渲染是热路径，禁止每帧分配内存。`PadState` 预分配，跨帧复用，调用方不得保存引用。
- 主循环归平台：固定 60Hz `update(1/60)` + `render(alpha)`。单帧时间上限 250ms，每渲染帧最多 5 次 update，超出丢弃。
- 不要改任何 origin / scheme（`androidScheme`、hostname、Tauri 的 scheme）。改了等于换域名，IndexedDB 里的存档和已装游戏会丢，见 D3。
- 新依赖先对照 `docs/compatibility.md` 第 6 节。已确定的运行时依赖只有：Preact、fflate、`@noble/hashes`、`@noble/curves`（后两个 M2 才加）。IndexedDB 封装是自己写的，没引 `idb`。
- 工具链版本精确锁定在 `package.json`。文件名全小写加连字符；一个文件一个主要导出；不写 barrel `index.ts`。
- 注释只解释为什么。提交信息用约定式前缀（`feat:` `fix:` `docs:` `test:` `chore:`），主题用中文。
- 私钥、keystore、`.env` 不进仓库。`docs/` 之外不要新增 Markdown 记进度或笔记。
- `docs/` 不参与 Prettier（见 `.prettierignore`）：它会按显示宽度重排中文表格，产生大量无关 diff。

## 多设备协作

- 动手前先同步：`git fetch --all --prune`，看 `git status --short` 和 `git log --oneline -5`，再 `git pull --ff-only`。
- 有未提交改动时先 `git stash push -u`（写清备注），拉完立刻 `git stash pop`。不要为了拉代码丢掉别人的改动。
- 拉不动就停，不要裸 `git pull` 造合并提交。
- 当前没有配置远端。远端接上之后，当天的提交当天推走。

## 文档索引

| 文档                       | 何时读                         |
| -------------------------- | ------------------------------ |
| `docs/architecture.md`     | 分层、数据流、信任模型         |
| `docs/decisions.md`        | 为什么这样选；改决策在文末追加 |
| `docs/roadmap.md`          | 里程碑与退出标准，当前进度     |
| `docs/local-dev.md`        | 在本机把自己的游戏跑起来       |
| `docs/repository.md`       | 目录、依赖方向、工具链版本     |
| `docs/runtime-api.md`      | 运行时接口，实现时按它写       |
| `docs/game-sdk.md`         | 游戏契约：生命周期、ctx API    |
| `docs/game-conformance.md` | 类型、脚手架、打包校验三道约束 |
| `docs/package-format.md`   | `.hbx`、catalog、签名、安装    |
| `docs/saves.md`            | 存档只在本机：存储、导出/导入  |
| `docs/input.md`            | 三层输入、映射、M0 实测清单    |
| `docs/pointer.md`          | 鼠标与触控：坐标换算、指针外观 |
| `docs/cheats.md`           | 金手指与调试口子               |
| `docs/cartridge-contract.md` | 卡带格式版本、资源上限、API 取舍 |
| `docs/tuning.md`        | 数值分层与金手指设计           |
| `docs/plugins.md`       | 可调项架构、三类插件、未来扩展 |
| `docs/distribution.md`  | 分发、更新、产品复核           |
| `docs/porting.md`       | **已有游戏怎么接进来（对外）**  |
| `docs/tank-port.md`     | 坦克游戏怎么移植进来           |
| `docs/compatibility.md`    | 基线、性能预算、依赖标准       |
| `docs/deployment.md`       | 开发环境与公网部署             |
