# 架构决策记录

每条决策：结论、备选、理由。推翻某条决策时，新增一条记录并注明取代关系，不要直接改写旧记录。

---

## D1 运行时：Web（TypeScript + Canvas2D/WebGL）

- **结论**：游戏是 Web 代码，平台提供运行时。
- **备选**：Godot（体验好，但每个游戏是独立导出物，难以组成"一个壳 + 多个包"）；Unity（许可与体积）；每个游戏分别出 Windows/TV 原生版（构建与测试成本 ×2，没有热更新）。
- **理由**：一份包到处运行；Chromium 在 Windows 与 Android 上都是成熟且持续更新的运行时；工具链（Vite/TS）成熟；对开源贡献者门槛最低。

## D2 壳：Android TV 用 Capacitor，Windows v1 用 PWA，Tauri 延后

- **结论**：Android 用 Capacitor 8；Windows 先用 Chrome/Edge 安装 PWA；需要开机自启、kiosk、原生输入时再上 Tauri 2。
- **备选**：Electron（体积大，对 TV 无意义）；Tauri 同时做 Android（移动端成熟度不如 Capacitor）；React Native / Flutter（内容是 Canvas，不需要原生控件）。
- **理由**：Capacitor 是 Android WebView 壳中最成熟的方案，插件模型简单，便于写原生输入插件。Windows 浏览器本身就是最好的壳，PWA 少一个要维护的构建物。

## D3 所有正式 Origin 都是 HTTPS，且永不修改

- **结论**：Android `https://localhost`（Capacitor 默认）；Web `https://play.<domain>`；Tauri `https://tauri.localhost`。
- **备选**：`androidScheme: 'http'` + 局域网 HTTP 货架。
- **理由**：已有公网域名，可以拿到真证书。HTTPS 源下 Gamepad API、Wake Lock、Web Crypto、Service Worker 等安全上下文 API 都可用。修改 scheme/hostname 等同于换域名，所有 IndexedDB 数据都会丢失（Capacitor 与 Tauri 官方文档均明确警告），所以第一天就固定。
- **代价**：货架必须走 HTTPS。局域网明文 HTTP 只用于开发。

## D4 Android 的手柄输入走原生桥，不依赖 WebView 的 Gamepad API

- **结论**：Capacitor 插件拦截 Activity 的 `dispatchKeyEvent` / `dispatchGenericMotionEvent`，把手柄事件推给 JS。
- **备选**：直接用 `navigator.getGamepads()`。
- **理由**：Android WebView 中 Gamepad API 长期存在问题（Chromium issue 41426881：WebView 中 `getGamepads()` 返回空列表）。原生层还能顺带解决两件事：吞掉 D-pad 以免 WebView 自己做焦点导航；吞掉 B 键以免被系统转成"返回"。Android 自带的按键布局表对 HID 手柄的映射也比 WebView 更一致。
- **验证**：M0 仍会在目标电视上测试 WebView Gamepad API；即使可用，也只作为备用输入源。

## D5 包格式：签名的 catalog + sha256 校验的 zip，单文件 ESM 入口，存在 IndexedDB

- **结论**：catalog 使用 Ed25519 分离签名；包是 zip（`.hbx`）；入口是单个 ESM 文件，依赖全部内联；文件以 Blob 形式存入 IndexedDB，运行时通过 blob URL 访问。
- **备选**：Service Worker + Cache API 托管包文件（Capacitor 的 Android WebView 对 Service Worker 支持不可靠）；原生文件系统（多一层原生代码）；多文件 ESM（blob URL 下无法解析相对 import）。
- **理由**：IndexedDB 在所有目标环境都可用且支持事务，安装可以做到原子。单文件入口让 `import(blobUrl)` 稳定可靠。签名与哈希使用 `@noble/curves`、`@noble/hashes`，因为 Web Crypto 的 Ed25519 在 Chromium 87 基线上不可用，而且 `crypto.subtle` 在开发用的非安全源上不存在。
- **以后**：单包超过约 200MB 时，增加原生文件系统存储后端（`PackageStore` 接口已为此预留）。

## D6 每次游戏会话是一个独立文档

- **结论**：货架是 `index.html`，游戏宿主是 `play.html`；进入/退出游戏就是整页跳转。
- **备选**：同一 SPA 里挂载/卸载游戏模块。
- **理由**：游戏遗留的定时器、事件监听器、WebGL 上下文、内存，只有丢弃整个文档才能保证回收干净。跳转代价约几十毫秒，可以接受。同源，存储共享。
- **关于桥**：Capacitor 的桥由 WebView 在每次页面加载时注入，插件监听器是 JS 侧 `addListener` 注册的，新页面重新注册即可，不存在"跳转后桥失效"的风险，无需专项验证。

## D7 主循环归平台所有：固定 60Hz 更新 + 插值渲染

- **结论**：游戏实现 `update(dt 固定)` 与 `render(alpha)`，不得自行调用 `requestAnimationFrame`。
- **理由**：结果可确定、可重放；50Hz 电视与 120Hz 显示器上行为一致；平台能统一做暂停、系统菜单、后台挂起、步数上限。

## D8 正式分发走公网 HTTPS 静态托管；ZeroTier 只用于开发和可选镜像

- **结论**：catalog 与包放在公网静态托管（对象存储 + CDN，或自建 Caddy）。ZeroTier 用于 adb 调试、Vite 热更新到电视，以及可选的局域网镜像。
- **备选**：只在局域网/ZeroTier 内提供货架。
- **理由**：电视不用安装 ZeroTier，PC 不用一直开着；项目本来就要开源，游戏包公开没有问题。下载源在设置中可配置、可多个，局域网镜像随时可加。

## D9 兼容基线：Chromium 87

- **结论**：构建目标 `chrome87`，用 `eslint-plugin-compat` 强制执行。低于基线时壳显示更新提示。
- **理由**：覆盖绝大多数仍在使用的 Android TV 设备（老设备可以通过 Play 商店更新 WebView），同时可以使用可选链、`??`、`Promise.allSettled`、flex `gap` 等基础特性。详见 compatibility.md。

## D10 UI 框架：Preact + 自写空间导航

- **结论**：货架 UI 用 Preact；焦点导航自写（约 200 行，基于矩形的最近邻算法 + 显式覆盖）。
- **备选**：React（体积大）；无框架（设置页、对话框写起来繁琐）；现成空间导航库（多为 React 绑定或长期不维护）。
- **理由**：Preact 体积约 4KB，生态成熟；焦点导航是 TV 上第一号体验问题，必须完全可控、可测试。游戏画面永远不经过 Preact。

## D11 仓库与工具链

- **结论**：pnpm workspace 单仓；Node LTS；TypeScript strict；Vite；Vitest；Playwright；ESLint + typescript-eslint + eslint-plugin-compat；Prettier；GitHub Actions。所有依赖固定精确版本，Renovate 统一升级。
- **理由**：全部是主流且长期维护的工具；版本精确固定，避免"昨天能跑今天不能跑"。

## D12 游戏是独立仓库，不进平台单仓

- **结论**：本仓库只放平台（壳、运行时、SDK、`hbx` CLI、catalog 协议与签名工具）。每个游戏一个独立仓库，依赖 npm 上的 `@hearthbox/sdk`，用自己的 CI 跑 `hbx pack`。本仓库只留 `fixtures/contract`，一个几十行的最小夹具，供平台 CI 验证打包、安装、启动、退出链路。
- **货架内容另存**：`catalog.json`、签名和 `.hbx` 包是发布产物，不是源代码。它们放在对象存储里单独托管，不进平台仓库，也不进游戏仓库——这样签名私钥只留在一个地方，任何游戏的 CI 都拿不到，改不了整份清单。M5 之前用本地静态服务代替，不需要为它建仓库或本地目录。
- **备选**：pnpm workspace 单仓，`games/` 下放所有游戏。
- **理由**：平台与游戏的版本节奏、发布物、CI 触发条件、密钥、协作权限都不相同。放在一起只能靠路径过滤维持，每加一个游戏就要改一次规则，而且游戏的提交频率会成倍放大平台 CI 的耗时。仓库分开后，游戏 CI 不需要 Android SDK，平台发版也不牵动游戏。
- **代价**：SDK 改动不能跟游戏改动放在同一个 PR 里验证。弥补方式是维护一个独立的范例游戏仓库，SDK 发版前用它跑集成。

## D13 游戏遵循架构靠工具链，不靠约定

- **结论**：游戏仓库由 `hbx create` 从模板生成，模板自带固定的构建配置与 CI；`hbx pack` 在打包时做结构校验，不合规的包打不出来。平台不提供运行时兜底来迁就不合规的包。
- **备选**：写一份游戏开发指南，靠审查保证。
- **理由**：仓库一分开，指南就没有强制力。类型、脚手架、打包校验三道都在工具里，游戏作者想偏离也会在打包前失败。详见 `docs/game-conformance.md`。

## D14 名称与许可

- **结论**：项目名 Hearthbox（中文名"炉边"），包名前缀 `@hearthbox/*`，CLI 名 `hbx`，包扩展名 `.hbx`。平台代码 MIT；游戏在 `game.json` 中各自声明许可。
- **理由**：撰写本文时，npm 上 `hearthbox` 包名与 GitHub 上 `hearthbox` 用户/组织名均未被占用（2026-10 查询）；`hearth` 已被占用。建议尽早注册 GitHub 组织与 npm scope。

## D15 画布归平台：游戏拿到的是 2D 上下文

- **结论**：`Display` 在 `attach` 时调用 `getContext('2d')`，完成整数/等比缩放、DPR 与 `imageSmoothingEnabled`。游戏从 `GameContext` 拿到的是 `CanvasRenderingContext2D`（字段名 `ctx2d`），不是可以自己再取上下文的 `HTMLCanvasElement`。WebGL 以后作为可选字段加上，不改 2D 签名，也不在 M1 提供。
- **备选**：把 `HTMLCanvasElement` 交给游戏自己取上下文（2D 与 WebGL 互斥，先取的人锁死画布，平台的 `scale()` 与平滑开关对 WebGL 无效）；Worker + OffscreenCanvas（输入、存档、资源都要跨线程拷贝，Android TV WebView 无实测，且与 D6、D7 冲突）。
- **理由**：M1 的契约夹具只画一个方块，2D 足够。像素游戏的整数缩放和最近邻必须由平台保证，不能靠约定。渲染引擎（如 PixiJS）仍由游戏自己依赖并打包，不进平台。
- **取代关系**：不推翻 D1。D1 允许 WebGL 作为游戏侧技术；本条只固定平台交给游戏的第一个上下文是 2D。`docs/game-sdk.md` 的 `GameContext` 已按本条改为 `ctx2d`。

## D16 游戏包必须自包含：SDK 内联，零裸导入

- **结论**：`game.js` 里不允许出现任何 `import` 语句，`@hearthbox/sdk` 也要内联进产物。`hbx pack` 与安装器都拒绝含裸导入的包。
- **背景**：包入口通过 blob URL `import()` 执行（D5）。blob URL 的模块没有包解析上下文，裸说明符直接抛 `Failed to resolve module specifier`。唯一能补的是 import maps，但它需要 Chromium 89+，而基线是 87（D9）。
- **代价**：SDK 会被复制进每个包。SDK 只有类型和一个恒等函数，实测内联后夹具包 1.68 kB，可以忽略。
- **取代关系**：修正 `docs/game-sdk.md` 原先"SDK 作为 external 由宿主提供"的说法。那条在 blob URL 方案下不成立。
