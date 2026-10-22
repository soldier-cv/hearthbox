# Hearthbox · 炉边

> 插上手柄，客厅就是街机厅。

Hearthbox 是一个**手柄优先**的自制游戏平台：一个"主机壳" + 一份"货架"（catalog）+ 一堆"卡带"（游戏包）。
壳装在 Android TV 或 Windows 上，打开后从货架下载游戏，装到本地，离线可玩。

- **一份游戏包，到处运行**：游戏只针对 Hearthbox SDK 开发，不针对操作系统。
- **壳负责一切平台差异**：手柄输入、画面缩放、音频、存档、安装、更新。
- **10-foot 优先**：全程手柄/遥控器可操作，3 米外可读。
- **输入不限手柄**：手柄、键盘、鼠标/触控同时可用。只做"点一点"的小游戏也能上平台。

## 状态

M1（运行时内核 + SDK v0）已完成：契约夹具能在 PC 浏览器里用手柄或键盘操作，存档刷新后保留。
M0 的真机实测与 M2 之后的里程碑见 [docs/roadmap.md](docs/roadmap.md)。

```bash
pnpm install
pnpm dev        # 启动货架，打开 http://127.0.0.1:5199
pnpm test       # 单元测试
pnpm lint       # ESLint + Prettier
pnpm typecheck  # 全包类型检查
```

`pnpm dev` 会先构建契约夹具再起 Vite。打开页面后按 Enter 或手柄键开始。
手柄的实际上报值可在 `/pads.html` 查看，用于填写 `docs/m0-findings.md`。

## 文档

| 文档                                            | 内容                                |
| ----------------------------------------------- | ----------------------------------- |
| [architecture.md](docs/architecture.md)         | 总体架构、分层、模块边界、数据流    |
| [decisions.md](docs/decisions.md)               | 架构决策记录（为什么这样选）        |
| [input.md](docs/input.md)                       | 手柄、键盘、指针三层输入与映射      |
| [pointer.md](docs/pointer.md)                   | 鼠标与触控：坐标换算、指针外观      |
| [game-sdk.md](docs/game-sdk.md)                 | 游戏开发契约：生命周期、ctx API     |
| [package-format.md](docs/package-format.md)     | 游戏包、catalog、签名、安装流程     |
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
  fixtures/
    contract/         # 最小契约夹具，只用于平台 CI 自测，不是游戏
  tools/
    hbx/              # CLI：pack / sign / publish / keygen
  docs/
```

## 许可

平台代码使用 [MIT](LICENSE)。每个游戏包在自己的 `game.json` 中声明代码与素材的许可。
