# Hearthbox · 炉边

手柄优先的自制游戏平台。一个壳（Android TV / Windows）+ 一份货架（catalog）+ 多份游戏包（`.hbx`）。游戏只针对 SDK 写，不针对操作系统。

本文件是给在这个仓库里工作的代理的入口。细节在 `docs/`，这里只讲边界、目录和怎么对接。改架构时在 `docs/decisions.md` 追加新记录，不要改写旧记录。

## 现在处于什么阶段

**M1 已完成**：运行时内核、SDK v0、货架页、宿主页都能在 PC 浏览器里跑。契约夹具与输入夹具都能玩，存档刷新后保留。

M0 的真机实测、M2 之后的里程碑都没做，见 `docs/roadmap.md`。不要在 M2 之前建 `packages/catalog`、`tools/hbx`、`native/android`。

关键决策见 `docs/decisions.md`（D1–D18）。实现时最容易被忽略的三条：

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
  fixtures/
    contract/         # 最小契约夹具：移动、变色、存档。只给平台 CI，不是游戏
    inputs/           # 输入夹具：鼠标点选、滚轮、键盘、金手指演示
  tools/
    hbx/              # CLI：create / dev / pack / sign / publish（M2 才创建）
  scripts/            # dev-server.mjs、link-fixtures.mjs
  docs/               # 架构、决策、契约。进度只改 docs/roadmap.md 的复选框
```

依赖只允许顺着箭头：

```
apps/shell → packages/runtime → packages/sdk
                    └→ packages/catalog      （M2 起）
tools/hbx → packages/catalog → packages/sdk
fixtures/* → packages/sdk
```

反向 import 禁止，包括类型导入。包之间只走 `package.json` 的 `exports`，不引用包内深层文件。`packages/sdk` 不得依赖本仓库的任何其他包。

**夹具不是游戏**：`fixtures/` 下的两个包是平台自测用的，不进 npm、不发版。

## 常用命令

```bash
pnpm install
pnpm dev        # 构建夹具 → 同步到壳 → 起 Vite（127.0.0.1:5199）
pnpm test       # Vitest 单元测试
pnpm typecheck  # 全包类型检查
pnpm lint       # ESLint + Prettier
pnpm build      # 构建全部包
pnpm fixtures   # 只重建并同步夹具

pnpm exec playwright test   # 端到端（会自己起 dev server）
```

## 游戏怎么和这套对接

游戏不进本仓库（D12）。每个游戏一个独立仓库，依赖 npm 上的 `@hearthbox/sdk`。本仓库只留 `fixtures/` 做平台自测。

- 新游戏用 `hbx create`（M2 才有）。M2 之前照 `fixtures/inputs` 的结构手写：`package.json` + `game.json` + `src/main.ts` + `vite.config.ts`，`pnpm fixtures` 会自动把它同步进货架。
- 入口是 `defineGame()` 的默认导出。生命周期只有 `create` / `update` / `render` / `pause` / `resume` / `dispose`。
- 平台能力只通过 `ctx` 拿：`input`（三层）、`storage`、`audio`、`assets`、`cheats`、`debug`、`ctx2d`、`setPointerMode`、`exit`、`rumble`。
- 游戏仓库由 `hbx create` 生成的模板自带构建配置；手写的话必须让构建产物零裸导入、target `chrome87`。

详细的接入步骤见技能包：`.agents/skills/hearthbox-game/SKILL.md`。

游戏作者不克隆本仓库。平台升级时，SDK 主版本内只加不改。

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

| 文档 | 何时读 |
|---|---|
| `docs/architecture.md` | 分层、数据流、信任模型 |
| `docs/decisions.md` | 为什么这样选；改决策在文末追加 |
| `docs/roadmap.md` | 里程碑与退出标准，当前进度 |
| `docs/repository.md` | 目录、依赖方向、工具链版本 |
| `docs/runtime-api.md` | 运行时接口，实现时按它写 |
| `docs/game-sdk.md` | 游戏契约：生命周期、ctx API |
| `docs/game-conformance.md` | 类型、脚手架、打包校验三道约束 |
| `docs/package-format.md` | `.hbx`、catalog、签名、安装 |
| `docs/input.md` | 三层输入、映射、M0 实测清单 |
| `docs/pointer.md` | 鼠标与触控：坐标换算、指针外观 |
| `docs/cheats.md` | 金手指与调试口子 |
| `docs/compatibility.md` | 基线、性能预算、依赖标准 |
| `docs/deployment.md` | 开发环境与公网部署 |
