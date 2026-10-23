# Hearthbox · 炉边

> 插上手柄，客厅就是街机厅。

Hearthbox 是一个**手柄优先**的自制游戏平台：一个"主机壳" + 一份"货架"（catalog）+ 一堆"卡带"（游戏包）。
壳装在 Android TV 或 Windows 上，打开后从货架下载游戏，装到本地，离线可玩。

- **一份游戏包，到处运行**：游戏只针对 Hearthbox SDK 开发，不针对操作系统。
- **壳负责一切平台差异**：手柄输入、画面缩放、音频、存档、安装、更新。
- **10-foot 优先**：全程手柄/遥控器可操作，3 米外可读。
- **输入不限手柄**：手柄、键盘、鼠标/触控同时可用。只做"点一点"的小游戏也能上平台。

## 状态

M1（运行时内核 + SDK v0）已完成：演示游戏能在 PC 浏览器里用手柄、键盘或鼠标操作，存档刷新后保留。
货架、系统菜单、金手指/设置/成就面板都能只用方向键 + A/B 走完。
本地 `.hbx` / URL / GitHub Release 导入已经可用，但**未签名、未沙箱**；catalog、签名、自动更新还没做。
存档只在本机 IndexedDB，不上云；货架卡片上的「存档」可以导出/导入 JSON。

M0 的真机实测与后续里程碑见 [docs/roadmap.md](docs/roadmap.md)。

```bash
pnpm install
pnpm dev        # 启动货架，打开 http://127.0.0.1:5199
pnpm test       # 单元测试
pnpm lint       # ESLint + Prettier
pnpm typecheck  # 全包类型检查
```

## 走一遍

1. `pnpm install && pnpm dev`，打开 `http://127.0.0.1:5199`。
2. 货架：方向键/摇杆移动，`Enter` / `A` / 空格进入；鼠标直接点卡片也可以。
3. 演示游戏：`WASD` 或方向键移动，`A` 换色，`R` 随机，`Shift` 加速。
4. 游戏内按 `Esc`，或长按 `Start + Select` 1 秒，打开系统菜单；HUD 右上角的「菜单」也走同一个入口。
5. 菜单里用方向键选，`A` / `Enter` 确认，`B` / `Esc` 返回。金手指/设置/成就面板里：上下选行，左右改值，`A` 切换。
6. 退出：菜单里选「退出游戏」，回到货架。
7. 导入别人的游戏：`pnpm pack:game ../my-game` 生成 `.hbx`，打开 `/import.html` 选择文件，或填 GitHub 仓库 / `.hbx` 地址。安装后货架出现「已安装」卡片，旁边有「删除」。
8. 存档：货架卡片点「存档」，导出/导入本机 JSON；导入会整体替换该游戏的存档，建议先导出备份。
9. 手柄检测：打开 `/pads.html`，插上手柄按任意键，查看 id、mapping、轴和按键的实时值。
10. 崩溃页：打开 `/play.html?id=nope&base=%2Fnope`，应看到错误信息和「返回货架」。

当前开发期仍从工作区兄弟目录扫描源码游戏；玩家侧可导入 `.hbx`。catalog、签名、自动更新和沙箱还没做，导入只面向你信任的作者。

## 把游戏接进来

**开发期（有源码）**：游戏目录放在 `hearthbox/` 旁边，写 `game.json`，构建出 `dist/game.js`；`pnpm dev` 扫描后出现在货架。

**别人做好的游戏（只有构建产物）**：

```bash
pnpm pack:game ../my-game          # 生成 my-game-1.0.0.hbx
```

打开 `/import.html`，选择 `.hbx`，或填 GitHub 仓库地址/`.hbx` 直链。GitHub 仓库会取最新 Release 里的 `.hbx` 资产；没有 Release 就先用上面的命令打一个。

游戏仓库自带 `.github/workflows/release.yml`：打 `v*` tag 或手动运行才会构建，不是每次 push 都跑。构建出的 `.hbx` 会挂到 Release，导入页填仓库地址就能拿到。

```bash
git tag v1.0.0
git push origin v1.0.0
```

平台 CI 在 PR、push 到 `main`、手动运行时校验，并上传壳（`apps/shell/dist`）和演示游戏包供下载；打 `v*` tag 由 `.github/workflows/release.yml` 生成 Release 资产：`hearthbox-shell-<tag>.zip`（Windows/浏览器用的静态壳）+ `hearthbox-demo-<tag>.hbx` + 校验和。Android TV 的 APK 还没进 CI——`native/android` 属于 M4，工程还不存在。

| 你的游戏是                     | 看哪份                                              |
| ------------------------------ | --------------------------------------------------- |
| 新游戏                         | 从 `templates/game/` 复制，再看 `docs/local-dev.md` |
| 已有网页游戏（HTML/JS/Canvas） | `docs/porting.md`，按四步改造                       |
| 已按 SDK 写好，要分享/发布     | `pnpm pack:game` → `/import.html`                   |

Unity/Godot/原生工程不能直接加载：入口必须是单个 `game.js`（ESM、零 import），所以要么先导出 Web 再按 `porting.md` 改造，要么按 SDK 重写。

平台不在设备上编译源码。GitHub 只提供 Release 资产；catalog、签名、更新和沙箱是下一步，当前导入的包不验签，也不在沙箱里运行。

## 文档

| 文档                                            | 内容                                |
| ----------------------------------------------- | ----------------------------------- |
| [architecture.md](docs/architecture.md)         | 总体架构、分层、模块边界、数据流    |
| [decisions.md](docs/decisions.md)               | 架构决策记录（为什么这样选）        |
| [input.md](docs/input.md)                       | 手柄、键盘、指针三层输入与映射      |
| [pointer.md](docs/pointer.md)                   | 鼠标与触控：坐标换算、指针外观      |
| [cheats.md](docs/cheats.md)                     | 金手指与调试口子                    |
| [porting.md](docs/porting.md)                   | **已有游戏怎么接进来**              |
| [local-dev.md](docs/local-dev.md)               | 在本机跑自己的游戏                  |
| [game-sdk.md](docs/game-sdk.md)                 | 游戏开发契约：生命周期、ctx API     |
| [package-format.md](docs/package-format.md)     | 游戏包、catalog、签名、安装流程     |
| [saves.md](docs/saves.md)                       | 存档只在本机：存储、更新、导出/导入 |
| [deployment.md](docs/deployment.md)             | 开发环境、ZeroTier、公网 HTTPS 部署 |
| [compatibility.md](docs/compatibility.md)       | 兼容基线、性能预算、设备矩阵        |
| [roadmap.md](docs/roadmap.md)                   | 里程碑与验收标准                    |
| [game-conformance.md](docs/game-conformance.md) | 游戏仓库如何被工具链约束住          |
| [runtime-api.md](docs/runtime-api.md)           | 运行时各模块的接口签名              |
| [repository.md](docs/repository.md)             | 仓库布局、依赖方向、工具链版本      |
| [bootstrap.md](docs/bootstrap.md)               | 首次初始化的任务范围与提交标准      |

## 目录规划

```
hearthbox/
  apps/
    shell/            # 平台前端：货架 UI、游戏宿主页（Vite + Preact）
  packages/
    runtime/          # 主循环 / 输入 / 显示 / 音频 / 存储 / 安装器
    sdk/              # 游戏开发者依赖的类型与 defineGame()，发布到 npm
    catalog/          # catalog 与包格式的 schema、校验、签名
  native/
    android/          # Capacitor Android TV 壳 + 原生输入插件
  demo/               # 演示游戏：把平台每项能力都用一遍
  tools/
    hbx/              # CLI：pack / sign / publish / keygen
  docs/
```

## 许可

平台代码使用 [MIT](LICENSE)。每个游戏包在自己的 `game.json` 中声明代码与素材的许可。
