# 仓库布局与依赖规则

## 1. 目录

```
hearthbox/
  apps/
    shell/                # 货架与宿主页，唯一的前端应用
      index.html          # 货架入口
      play.html           # 游戏宿主入口
      src/
  packages/
    runtime/              # 运行时，见 docs/runtime-api.md
    sdk/                  # 只有类型与 defineGame()，发布到 npm
    catalog/              # M2 才创建：schema、校验、签名
  native/
    android/              # M4 才创建：Capacitor 工程与原生输入插件
  demo/                   # 演示游戏：把平台每项能力都用一遍
    src/main.ts
    game.json
    assets/
  tools/
    hbx/                  # M2 才创建：CLI
  docs/
```

标注"M2 / M4 才创建"的目录，在对应里程碑之前不要建。空目录没有约束力，反而让人误以为那里已经有约定。

## 2. 依赖方向

```
apps/shell ──► packages/runtime ──► packages/sdk
                     │
                     └──► packages/catalog     （M2 起）

tools/hbx ──► packages/catalog ──► packages/sdk
demo ──► packages/sdk
native/android ──► 通过 HostBridge 与 apps/shell 交互，不直接依赖 runtime 内部
```

规则：

- 箭头指向的方向才允许 import。反向 import 一律禁止，包括类型导入。
- `packages/sdk` 不得依赖本仓库内的任何其他包，也不得依赖任何运行时库。它发布后被游戏仓库单独安装。
- `packages/runtime` 不得依赖 `apps/shell`。UI 逻辑留在 shell 里。
- 包之间通过 `package.json` 的 `exports` 字段暴露入口，不引用包内的深层文件。

## 3. 包名与脚本

| 目录 | 包名 |
|---|---|
| `apps/shell` | `@hearthbox/shell` |
| `packages/runtime` | `@hearthbox/runtime` |
| `packages/sdk` | `@hearthbox/sdk` |
| `packages/catalog` | `@hearthbox/catalog` |
| `tools/hbx` | `@hearthbox/hbx` |

根 `package.json` 只放 workspace 配置与这些脚本：

| 脚本 | 行为 |
|---|---|
| `dev` | 启动 shell 的 Vite dev server |
| `build` | 构建全部包 |
| `typecheck` | 全部包类型检查，无输出 |
| `lint` | ESLint + Prettier 检查 |
| `test` | Vitest 一次运行 |

各包不自带同名脚本的，从根脚本里排除，不要为了对齐而写空脚本。

## 4. 工具链版本

具体版本在初始化时取当时的最新稳定版并**精确锁定**，不写 `^`。选择范围：

| 工具        | 要求                                                                   |
| ----------- | ---------------------------------------------------------------------- |
| Node        | 当前 LTS，用 `.node-version` 固定                                      |
| pnpm        | 最新稳定版，写入 `packageManager` 字段                                 |
| TypeScript  | 最新稳定版，`strict` 全开                                              |
| Vite        | 最新稳定版                                                             |
| Vitest      | 与 Vite 同代                                                           |
| Preact      | 最新稳定版                                                             |
| ESLint      | 扁平配置，配 `typescript-eslint`、`eslint-plugin-compat`               |
| Prettier    | 最新稳定版                                                             |

`eslint-plugin-compat` 的 browserslist 目标是 `chrome >= 87`，与 `docs/compatibility.md` 一致。

初始化时把实际选定的版本号回写到本表，避免后来者猜。

**2026-10 实际锁定的版本**（`pnpm-lock.yaml` 为准）：

| 工具                 | 版本   |
| -------------------- | ------ |
| Node                 | 24.19.0（`.node-version` 写 `22`，>=22 均可） |
| pnpm                 | 9.15.0 |
| TypeScript           | 5.9.3  |
| Vite                 | 6.4.5  |
| Vitest               | 2.1.9  |
| Preact               | 10.29.8 |
| ESLint / typescript-eslint | 9.39.5 / 8.72.0 |
| eslint-plugin-compat | 6.2.1  |
| Prettier             | 3.9.10 |
| Playwright           | 1.64.1 |
| fake-indexeddb       | 6.2.6  |

未引入 `idb`：`packages/runtime/src/storage.ts` 自己封装了需要的那几个方法，符合第 6 节"能用 50 行自己写完的不引入"。`fflate` 与 `@noble/*` 属于 M2，届时再加。

## 5. 代码风格

- 文件名全小写，单词用连字符。
- 一个文件一个主要导出，文件名与导出名对应。
- 不写 barrel `index.ts` 再转出一切；每个包的入口在 `package.json` 的 `exports` 里显式列。
- 注释只解释为什么，不解释代码在做什么。
- 提交信息用约定式：`feat:`、`fix:`、`docs:`、`test:`、`chore:`，主题用中文。

## 6. 什么不进仓库

见根目录 `.gitignore`。补充一条：`docs/` 之外不要新增 Markdown 文件来记录进度或笔记，进度写在 `docs/roadmap.md` 的复选框里。
