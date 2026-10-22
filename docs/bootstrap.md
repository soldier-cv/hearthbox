# 首次初始化任务

本文档是第一次提交代码的范围。做完这里列出的事就可以提交，不要多做。

## 0. 前置条件

M0 的真机实测（见 `docs/roadmap.md`）需要电视和手柄，**不阻塞初始化**。初始化只搭建能在 PC 浏览器里跑起来的部分。

但有一项必须在写 Android 原生桥之前完成：记录现有 2.4G 手柄在 PC 浏览器里的 `gamepad.id` 和 `mapping`。这一步只用一个 HTML 文件，归到下面的任务 6。

## 1. 初始化仓库工具链

- 按 `docs/repository.md` 第 4 节选定版本并精确锁定。
- 建立 pnpm workspace，创建 `apps/shell`、`packages/runtime`、`packages/sdk`、`fixtures/contract`。
- 配置 TypeScript、ESLint、Prettier。
- 根脚本 `dev`、`build`、`typecheck`、`lint`、`test` 都能跑。
- 把选定的版本号回写到 `docs/repository.md` 的表里。

不创建 `packages/catalog`、`tools/hbx`、`native/android`，那些属于后续里程碑。

## 2. 实现 SDK

- `defineGame()` 与 `docs/game-sdk.md` 中的类型。
- 零运行时依赖，构建产物能被其他包类型引用。

## 3. 实现运行时

按 `docs/runtime-api.md` 实现 `loop`、`input`、`display`、`audio`、`storage`、`host`。

- Web 版 `HostBridge`：键盘输入源 + Gamepad API 输入源。
- 每个模块有单元测试。主循环的测试用手动推进时间的方式，不依赖真实 `requestAnimationFrame`。
- 存储测试用 `fake-indexeddb`。

## 4. 实现壳的最小页面

只做两页，不做货架 UI（那是 M3）：

- `index.html`：列出本地夹具，手柄或键盘确认后进入。
- `play.html`：调用 `Session.start()`，显示崩溃页和"返回"。

能用键盘玩即可，界面不做美化。

## 5. 契约夹具

`fixtures/contract` 实现一个最小游戏：摇杆（或键盘）移动一个方块，按键改变颜色，位置写入存档。

验收：刷新页面后方块还在原来的位置。

## 6. 记录手柄在 PC 上的表现

- 一个独立的 HTML 页面，显示 `navigator.getGamepads()` 的 `id`、`mapping`、各轴与各按键的实时值。
- 把现有手柄的结果记到 `docs/m0-findings.md`。电视部分留空，等有设备再补。

## 7. 提交

- 提交前 `lint`、`typecheck`、`test`、`build` 全部通过。
- 提交信息：`feat: 初始化仓库并实现运行时内核`。
- 只提交这一次，不做额外的"整理"提交。

## 不在本次范围内

- 任何 Android 相关代码。
- catalog、签名、打包 CLI。
- 货架的网格、焦点导航、设置页。
- 部署、CI workflow、PWA manifest。

这些分别属于 M2 到 M5，提前做会在接口还没验证时固化错误的形状。
