# 兼容性与性能预算

## 1. 运行时基线：Chromium 87

构建目标 `chrome87`，由 `eslint-plugin-compat`（browserslist `chrome >= 87`）在 CI 中强制执行。选择 87 的原因见 decisions.md D9。

| 可以使用 | 禁止使用（低于基线或需安全上下文） |
|---|---|
| 可选链、`??`、`Promise.allSettled`、`String.replaceAll`、`globalThis` | `Array.prototype.at`、`structuredClone`、`Object.hasOwn`（Chromium 92+） |
| `flex` 的 `gap`、`aspect-ratio`（87 支持） | top-level await（89+）、`Array.findLast`（97+） |
| ES modules、dynamic `import()`、`import.meta` | `crypto.subtle`（开发用 HTTP 源不可用）、Web Crypto Ed25519（137+） |
| OffscreenCanvas 的 2D（87 支持） | WebGPU（113+，且 Android TV 无保证） |
| WebGL 1.0、WebGL 2.0（需运行时检测） | SharedArrayBuffer / 跨域隔离（需要额外响应头，不值得） |

- 需要新 API 时，先确认 Chromium 87 的支持情况再使用；检测失败要有降级路径，不能白屏。
- 克隆对象用平台内置的小函数，不调用 `structuredClone`。
- 随机 ID 用 `Math.random` 方案，不用 `crypto.randomUUID`。

## 2. 系统基线

| 平台 | 基线 | 说明 |
|---|---|---|
| Android TV | Android 7.0（API 24） | Capacitor 8 的最低版本 |
| Android WebView | Chromium 87+ | 更低时壳显示"请到应用商店更新 Android System WebView"，不尝试运行 |
| Windows | Windows 10 21H2 + Edge/Chrome 最新两个大版本 | PWA 形态 |
| 手柄 | HID 手柄、XInput 手柄 | 单个设备最多 4 个；DInput 手柄通过校准向导支持 |

不支持：Android 手机/平板（布局未适配，可运行但不承诺）、Tizen、webOS、iOS/tvOS、游戏主机。

## 3. 性能预算

参考设备：入门级 Android TV 盒子（Amlogic S905X 级别，4×A53，2GB 内存）与一台五年内的 Windows PC。

| 指标 | 预算 |
|---|---|
| 冷启动到货架可操作 | ≤ 2.5s（参考盒子） |
| 从货架进入已安装游戏 | ≤ 1.5s（不含游戏自己的资源解码） |
| 平台每帧开销（不含游戏） | ≤ 1ms |
| 输入延迟（原生桥增加的部分） | ≤ 1 帧（p99） |
| 稳定帧率 | 60fps；掉到 50Hz 面板时允许按刷新率渲染，但 update 仍是 60Hz |
| 每帧内存分配 | 稳定状态下平台侧为零（预分配 PadState、复用数组） |
| 壳的 JS 体积 | ≤ 150KB gzip |
| 壳的空闲内存 | ≤ 50MB |
| 音频往返延迟 | 尽力 ≤ 80ms；不做音游 |

执行手段：

- 主循环用累加器 + 每帧最多 5 个 update，超时丢弃并追帧，防止"死亡螺旋"。
- 画布按逻辑分辨率创建 backing store，CSS 缩放显示；像素游戏整数倍缩放。
- Android TV 上用 `FLAG_KEEP_SCREEN_ON`，不依赖手柄输入重置系统屏保计时。
- 游戏运行期间 `AudioContext` 使用 `latencyHint: 'interactive'`。
- 大文件解压用流式 API，峰值内存不超过包大小的两倍。

## 4. 显示

- 逻辑分辨率由游戏声明，平台负责适配物理屏幕。
- `scale: integer`：取不超过屏幕的最大整数倍，其余留黑边。320×180 在 1080p 上为 6 倍、4K 上为 12 倍。
- `scale: fit`：等比缩放铺满，可能有黑边。
- 安全区：所有 UI 元素离屏幕边缘至少 5%，避免老电视过扫描裁切。
- 10-foot 规范：正文字号 ≥ 24px（1080p 基准），焦点态对比明显，任何操作都不依赖悬停。
- DPR：按 `window.devicePixelRatio` 设置 backing store，但逻辑分辨率不变；在电视上实测确认 WebView 没有把视口缩放成非 1 的值。

## 5. 测试策略

| 层 | 工具 | 覆盖 |
|---|---|---|
| 单元 | Vitest + fake-indexeddb | 主循环步进、死区与边沿、semver/SDK 兼容判断、catalog 验签、安装事务与回滚 |
| 端到端 | Playwright | 伪造 `InputSource` 驱动：浏览货架、从本地服务器安装 demo 包、启动、退出、崩溃恢复 |
| 原生 | Kotlin 纯函数测试（无设备） | 按键/轴到 `Button` 的映射表 |
| 真机 | 手工清单 | input.md 第 7 节的 M0 清单；每个里程碑结束时在参考盒子上复测一次帧率与内存 |

Playwright 不能模拟真实手柄，所以端到端测试一律走伪造输入源；真实手柄行为只在真机清单里验证。

## 6. 依赖选择标准

引入新依赖前确认：

1. 最近 12 个月有发布，且有不止一个维护者（或属于大组织）。
2. 体积与功能相称；能用 50 行自己写完的不引入。
3. 许可证兼容 MIT（MIT / BSD / Apache-2.0 / ISC）。
4. 不依赖 Node API（运行时包要在浏览器里跑）。

当前确定的运行时依赖：Preact（UI）、idb（IndexedDB 封装）、fflate（解压）、`@noble/hashes`、`@noble/curves`（校验）。渲染引擎（如 PixiJS）由具体游戏自行依赖并打包，不进入平台。
