# 架构

## 1. 目标与非目标

**目标**

- 一份游戏包同时运行在 Android TV 和 Windows 上，无需按系统分别构建。
- 通用手柄（2.4G / 蓝牙 / XInput / DInput）开箱即用，可重映射。
- 低延迟、稳定 60fps，在入门级 Android TV 盒子上也成立。
- 游戏通过货架下载、本地安装、离线可玩、可更新、可回滚。
- 架构可开源：边界清晰、依赖成熟、第三方能为它写游戏。

**非目标（v1）**

- 不做模拟器、不分发 ROM。模拟器核未来可作为普通游戏包接入，但不在 v1 范围。
- 不做账号、云存档、联网对战、商店支付。
- 不支持 Tizen / webOS / iOS / tvOS。
- 不追求 3D 大作级渲染；目标是 2D 与轻量 3D。

## 2. 总览

```
┌──────────────────────── 壳 Shell（每个平台一个，薄） ────────────────────────┐
│  Android TV: Capacitor WebView  origin = https://localhost                      │
│  Windows:    PWA（Chrome/Edge） origin = https://play.<domain>                  │
│  （以后）    Tauri              origin = https://tauri.localhost                │
│  职责：提供安全源、全屏窗口、原生输入、屏幕常亮、生命周期事件                 │
└───────────────────────────────────────┬──────────────────────────────────────┘
                                        │ HostBridge（唯一的平台差异接口）
┌───────────────────────────────────────▼──────────────────────────────────────┐
│ 平台本体 apps/shell + packages/runtime（99% 的代码，所有平台共用）           │
│  shelf    货架 UI、焦点导航、设置、安装管理                                   │
│  host     游戏宿主页 play.html：创建 ctx、跑主循环、错误边界                  │
│  runtime  loop · input · display · audio · storage · installer · catalog      │
└───────────────────────────────────────┬──────────────────────────────────────┘
                                        │ GameContext（SDK 契约，见 game-sdk.md）
┌───────────────────────────────────────▼──────────────────────────────────────┐
│ 游戏包 *.hbx：game.json + game.js（单文件 ESM）+ 素材                         │
└──────────────────────────────────────────────────────────────────────────────┘

             HTTPS（只读静态文件）
货架服务 ──────────────────────────► catalog.json + catalog.json.sig + packages/*.hbx
（公网静态托管为主，局域网镜像可选，见 deployment.md）
```

## 3. 三种壳

| | Android TV | Windows（v1） | Windows（以后） |
|---|---|---|---|
| 技术 | Capacitor 8 | 浏览器 PWA | Tauri 2 |
| Origin | `https://localhost`（默认值，永不修改） | `https://play.<domain>` | `https://tauri.localhost`（`useHttpsScheme: true`） |
| 平台本体来源 | 打包进 APK | Service Worker 缓存 | 打包进 exe |
| 手柄来源 | **原生输入桥**（见 input.md） | Gamepad API | Gamepad API |
| 遥控器/键盘 | 原生桥 + DOM 键盘事件 | DOM 键盘事件 | DOM 键盘事件 |
| 屏幕常亮 | `FLAG_KEEP_SCREEN_ON` | Screen Wake Lock API | 原生 |

壳之间的全部差异收敛在一个 `HostBridge` 接口里，平台本体只依赖这个接口：

```ts
interface HostBridge {
  kind: 'android-tv' | 'web' | 'tauri';
  inputSources(): InputSource[];        // 平台提供哪些输入源
  keepAwake(on: boolean): void;
  onLifecycle(cb: (e: 'pause' | 'resume') => void): () => void;
  exitApp?(): void;                     // 仅 Android
  rumble?(player: number, strong: number, weak: number, ms: number): void;
}
```

## 4. 运行时模块

| 模块 | 职责 | 不做什么 |
|---|---|---|
| `loop` | 固定 60Hz 更新 + rAF 渲染 + 插值，步数上限防"死亡螺旋" | 不让游戏自己调 rAF |
| `input` | 汇总所有 InputSource → 每帧一个 `PadState[]`；死区、边沿、重映射、保留组合键 | 游戏永远不碰 `navigator.getGamepads()` |
| `display` | 逻辑分辨率 → 画布尺寸；整数缩放 / 适配缩放；安全区；DPR | 不管游戏怎么画 |
| `audio` | 唯一的 `AudioContext`；music / sfx 两条总线；暂停时挂起 | 不提供音乐引擎 |
| `storage` | IndexedDB：包文件、安装记录、存档、设置、手柄 profile | 不做云同步（v1） |
| `catalog` | 拉取 catalog、校验 Ed25519 签名、版本与 SDK 兼容判断 | 不信任未签名源（除非用户显式开启） |
| `installer` | 下载 → sha256 → 解压 → 事务写入 → 激活；保留上一版本用于回滚 | 不在安装中途切换版本 |

**依赖方向**：`shelf / host → runtime → (HostBridge, storage)`；`sdk` 只有类型和纯函数，零运行时依赖；游戏只依赖 `sdk`。禁止反向依赖。

## 5. 关键数据流

### 安装

```
shelf: 用户选"安装"
 → catalog 已验签条目 {id, version, url, sha256, size}
 → installer: fetch 流式下载 → 增量 sha256 → 比对
 → fflate 解压 → 校验内部 game.json 与条目一致 → sdk 范围兼容
 → 单个 IndexedDB 事务写入 files + install 记录(status=ready)
 → 旧版本标记为 previous（保留一个，其余清理）
```

任一步失败：丢弃本次写入，旧版本保持可用。

### 启动游戏

```
shelf → location.assign('play.html?game=<id>')        // 新文档，见 decisions.md D6
host  → 从 IndexedDB 读取文件 → 为每个文件建 blob URL
      → import(entryBlobUrl) → default export = defineGame(...)
      → 载入该游戏存档到内存 → 创建 GameContext
      → game.create(ctx) → loop.start()
```

### 每帧

```
rAF(now)
  acc += min(now - last, 250ms)
  while acc >= 1/60 and steps < 5:
    input.sample()            // 把各输入源的事件队列写入预分配的 PadState
    if 系统菜单打开: 菜单.update  else: game.update(ctx, 1/60)
    acc -= 1/60
  game.render(ctx, acc / (1/60))   // alpha 用于插值
```

### 退出游戏

```
Home 键 / 系统菜单"退出" / ctx.exit()
 → game.dispose?() → storage 立即 flush → location.assign('index.html')
```

整个文档被丢弃，游戏遗留的定时器、监听器、WebGL 上下文、blob URL 随之回收。

## 6. 固定的 Origin（改了就丢数据）

Origin 决定 IndexedDB 的位置。以下值写入后**永不修改**：

| 环境 | Origin |
|---|---|
| Android TV 正式 | `https://localhost`（Capacitor 默认 `androidScheme: 'https'`、默认 hostname） |
| Web/PWA 正式 | `https://play.<domain>` |
| Tauri（以后） | `https://tauri.localhost` |
| 开发 | `http://localhost:5173`、`http://<局域网IP>:5173`，数据与正式环境天然隔离 |

所有正式环境都是 HTTPS，所以货架也必须是 HTTPS，否则会被当混合内容拦截。

## 7. 信任模型

- v1 游戏**与平台同源运行**：恶意包理论上能读写所有存档。
- 缓解：catalog 必须带有效签名；官方源公钥内置；用户添加第三方源时首次使用即记录公钥（TOFU），之后变化即拒绝。
- 游戏只允许通过 `ctx` 与平台交互，**不承诺**任何全局对象可用。这为 v2 的 iframe 沙箱（`sandbox="allow-scripts"`、不同源、postMessage 传帧输入）留下路径，而游戏代码无需修改。

## 8. 错误处理

- `create / update / render` 包在 try/catch 中；外加 `window.onerror`、`unhandledrejection`。
- 任何游戏异常 → 停止循环 → 尝试 flush 存档 → 显示崩溃页（错误摘要、"返回货架"），日志写入本地环形缓冲区，设置页可导出。
- 货架本身的异常不会因游戏而发生，因为游戏运行在另一个文档里。
- 安装/更新失败永远不破坏已安装版本。
- WebView 版本低于基线时，壳显示"请更新 Android System WebView"页面，而不是白屏。
