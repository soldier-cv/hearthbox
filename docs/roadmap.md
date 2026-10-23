# 里程碑

每个里程碑都有退出标准；没达到不进入下一个。

## M0 · 验证假设（目标：1 周内）

在写平台之前，先确认风险最大的三件事。

- [ ] 在**目标电视**上记录这只 2.4G 手柄的实际轴与按键映射（清单见 input.md 第 7 节）——机制有官方文档，但这只手柄的具体上报方式没有公开资料
- [ ] 跨桥延迟 p99 < 4ms（此项无公开基准，必须自己测）
- [ ] PC 上 Chrome/Edge 的 Gamepad API 对该手柄的 `id` 与 `mapping` 记录在案
- [ ] 确认 `AudioContext` 的解锁方式（手柄按键是否算用户手势）

退出标准：一份实测记录（设备型号、Android 版本、WebView 版本、原始数据）写入 `docs/m0-findings.md`。

## M1 · 运行时内核 + SDK v0

具体任务、范围和提交标准见 `docs/bootstrap.md`。

- [x] `loop`、`input`、`display`、`audio`、`storage` 模块与单元测试
- [x] `defineGame()` 契约实现，`play.html` 宿主页
- [x] `demo`：演示游戏，把平台每项能力都用一遍
- [x] PC 浏览器里完整可玩

退出标准：演示游戏在 PC 上以 60fps 运行，刷新页面后存档还在。

> 已交付，并在此之上补了三层输入（手柄/键盘/指针）与金手指、调试口子。
> 见 `docs/input.md`、`docs/pointer.md`、`docs/cheats.md`。

## M2 · 包与货架协议

> 已可用（试验）：`pnpm pack:game` 生成 `.hbx`；`/import.html` 从文件/URL/GitHub Release 安装；已安装游戏可删除。未签名、无 catalog、无自动更新与回滚。
> 游戏仓库的 `release.yml` 只在 tag/手动运行时构建；平台 `ci.yml` 在 PR、push 到 `main`、手动运行时跑，发版走 `release.yml`（`v*` tag）。

- [ ] `.hbx` 打包、sha256、Ed25519 签名与验签
- [ ] 安装、卸载、更新、回滚的事务实现与失败注入测试
- [ ] `hbx pack` / `hbx sign` CLI
- [ ] `hbx pack` 的结构校验（相对 import、禁用 API、体积、路径、sdk 范围），并有反例测试：故意违规的包必须被拒绝

退出标准：演示游戏打成包，从本地静态服务器安装后可离线启动；安装中途断网不破坏已装版本；违规包打不出来。

## M3 · 壳 UI

- [ ] 货架网格、详情页、设置页（音量、死区、重映射、源管理）
- [ ] 空间焦点导航，全程手柄可操作
- [x] 10-foot 字号与 5% 安全区
- [x] 系统菜单（暂停 / 退出）与崩溃页

退出标准：拔掉鼠标键盘，只用手柄完成"安装 → 游玩 → 退出 → 卸载"。

## M4 · Android TV

- [x] Capacitor 工程、Leanback 启动器入口、横幅图标
- [ ] 原生输入插件接入 runtime（蓝牙手柄；遥控器方向键已走 DOM 键盘事件）
- [x] 屏幕常亮、返回键行为、生命周期暂停/恢复
- [ ] 真机热更新开发回路（当前是改完重新构建 APK 覆盖安装）

退出标准：电视上从货架安装并游玩演示游戏，断网后仍可启动。

## M5 · 部署与发布

- [ ] 公网 HTTPS 货架（域名待定）
- [x] Windows 安装包（NSIS）与绿色版 exe（Tauri 2 + 系统 WebView2）
- [x] GitHub Actions：lint、测试、构建 Web / Windows / Android 产物（Android 有 keystore secret 时签 release APK）
- [ ] 签名密钥管理（私钥不进仓库）
- [ ] Android 签名 release 的密钥接入 CI

退出标准：一台全新的电视，只侧载 APK、不连 ZeroTier，能从公网下载并游玩。

## M6 · 开源准备

- [ ] README 快速开始、贡献指南、行为准则
- [ ] `hbx create` 项目模板（含构建配置、CI、dev 回路）
- [ ] 范例游戏独立仓库（兼做 SDK 发版前的集成测试），SDK 文档指向它
- [ ] 许可审计（依赖许可证、素材许可证）
- [ ] 发布到 GitHub（组织名建议 `hearthbox`，尽早注册）

退出标准：一个不了解项目的人按 README 在 30 分钟内跑起开发环境，并在范例游戏仓库里打包出一份 `.hbx`。

## 以后（不排期，避免提前做）

- 局域网 catalog 镜像与多源 UI
- 存档导入/导出文件
- 第二个 SDK 主版本的兼容宿主
- iframe 沙箱运行第三方游戏
- Windows 开机自启、kiosk、自动更新
- 超过 200MB 的包的文件系统存储后端
