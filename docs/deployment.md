# 部署

## 1. 两个环境

| | 开发 | 正式 |
|---|---|---|
| 平台本体 | Vite dev server（PC 上） | Android：打进 APK；Windows：Tauri 安装包 / 绿色版 exe |
| 货架 catalog | 本地 `tools/hbx serve` 或正式源 | 公网 HTTPS 静态托管 |
| 电视如何访问 | 构建 APK 后 `adb install -r`，改完重装（数据保留） | 安装 APK |
| 网络 | 局域网 / ZeroTier | 公网；ZeroTier 仅作可选镜像 |

原则：**正式环境不依赖任何一台家里的机器开着**。ZeroTier 是开发工具，不是运行依赖。

## 2. 域名规划（占位，实施时替换）

| 主机名 | 用途 |
|---|---|
| `play.example.com` | Windows / 浏览器用的静态壳 |
| `games.example.com` | catalog.json、签名、`.hbx` 包文件 |

两个域名都是 HTTPS。包文件域名对所有来源开放 CORS（`Access-Control-Allow-Origin: *`，无 Cookie），因为文件是公开的。

缓存头：

- `catalog.json`、`catalog.json.sig`：`Cache-Control: no-cache`（每次重新验证）。
- `packages/<id>/<version>.hbx`：文件名含版本，`Cache-Control: public, max-age=31536000, immutable`。

## 3. 托管方式

任选其一，客户端无差别：

- **对象存储 + CDN**（如 Cloudflare R2、S3 + CDN）：推荐。注意部分静态托管平台对单文件大小有限制（如 Cloudflare Pages 单文件 25MB），包文件应放对象存储而不是页面托管。
- **自建**：一台有公网 IP 的机器跑 Caddy，自动签证书。

```caddyfile
games.example.com {
    root * /srv/hearthbox
    header {
        Access-Control-Allow-Origin *
        Cache-Control "public, max-age=31536000, immutable"
    }
    @catalog path /catalog.json /catalog.json.sig
    header @catalog Cache-Control "no-cache"
    file_server
}
```

## 4. 局域网镜像（可选）

家里有 NAS 或常开的机器时，可以用 Caddy + DNS-01 证书做内网镜像：

- 公网域名解析到 ZeroTier/局域网地址（或用 split DNS）。
- 证书用 DNS-01 挑战签发，不需要公网 80/443 端口。
- 在 Hearthbox 设置里把镜像 URL 加为第二个源。

注意：部分路由器的 DNS 有 rebind 防护（如 OpenWrt 默认的 dnsmasq），会拒绝"公网域名解析到内网 IP"。遇到时需要在路由器上为该域名加白名单——**这是路由器配置，本项目不自动修改任何网络设备**。

## 5. ZeroTier 的用途与边界

- 开发机与电视不在同一物理网络时，用 ZeroTier 组网。
- 电视端：Android TV 上侧载 ZeroTier 客户端（需要 VPN 授权），或在网关设备上接入 ZeroTier，让电视所在局域网整体可达。
- 用途仅限：`adb connect <ZeroTier IP>:5555` 安装调试、Vite 热更新、访问局域网镜像。
- 玩家的电视**不需要** ZeroTier 就能从公网货架下载游戏。

## 6. Android TV 开发回路

一次性准备：

1. 电视：设置 → 关于 → 连续点击版本号开启开发者选项 → 打开网络调试。
2. 开发机：`adb connect <电视IP>:5555`。

改完代码后重新构建并覆盖安装（origin 不变，存档和已装游戏都会保留）：

```
pnpm demo
pnpm build
pnpm --dir native exec cap sync android
cd native/android
./gradlew installDebug          # Windows: .\gradlew.bat installDebug
```

- Android 工程在 `native/android`（Capacitor 8，minSdk 24 / targetSdk 36）。Web 资源由 `cap sync` 从 `apps/shell/dist` 复制进去。
- 调试用桌面 Chrome 打开 `chrome://inspect`，能看到电视 WebView。
- 电视遥控器的方向键/确认键在 WebView 里是普通 DOM 键盘事件，平台现有的键盘层会映射成手柄输入。
- 蓝牙手柄的原生输入桥还没接：Android WebView 没有 Gamepad API，走摇杆要等原生插件。
- 正式包允许明文 HTTP（`usesCleartextTraffic` + `allowMixedContent`），用于从局域网 NAS 导入 `.hbx`；不接 HTTP 源时可以收紧。
- 签名：CI 在没有 keystore secret 时产出 debug APK（可直接侧载）；有 `ANDROID_KEYSTORE_BASE64` 等 secret 时构建签名的 release APK。签名私钥不入库。

## 7. Windows

- 开发：`pnpm demo && pnpm build`，然后 `pnpm --dir native/windows exec tauri dev`，或直接运行 `native/windows/src-tauri/target/release/hearthbox.exe`。
- 正式：NSIS 安装包（当前用户安装，不需要管理员）或绿色版单文件 `hearthbox.exe`。壳与资源都嵌在 exe 里，绿色版不依赖安装目录，只依赖系统的 WebView2 运行时。
- WebView2：Windows 11 自带；Windows 10 需要 Edge WebView2 Runtime，安装包会带 bootstrapper 自动补装（需要联网）。
- origin 固定为 `https://tauri.localhost`（`useHttpsScheme: true`），见 decisions.md D3；不要改成 `http`，否则存档和已装游戏全丢。
- 安装包没有 Authenticode 签名，SmartScreen 会提示"未知发布者"；要消除提示需要购买代码签名证书，不在当前范围。
- 自动更新没有接：更新方式是把新安装包/新 exe 覆盖上去，IndexedDB 数据保留。

## 8. CI（GitHub Actions）

**校验流水线**（`.github/workflows/ci.yml`，PR / push 到 `main` / 手动）：

1. `verify`（ubuntu）：install → lint → typecheck → unit test → `pnpm demo` + `pnpm build` → Playwright 端到端；上传静态壳与演示 `.hbx`
2. `windows`（windows-latest）：构建 Tauri 安装包与绿色版 exe；上传 `hearthbox-windows`
3. `android`（ubuntu-latest）：Capacitor sync + Gradle，产出 APK；上传 `hearthbox-android`

`windows` / `android` 依赖 `verify`，校验不过就不浪费原生构建时间。

打 `v*` tag 时（`.github/workflows/release.yml`）：

- 先跑完整校验与端到端，再并行构建 Web / Windows / Android
- Release 资产：`hearthbox-shell-<tag>.zip`、`hearthbox-demo-<tag>.hbx`、`hearthbox-windows-<tag>-setup.exe`、`hearthbox-windows-<tag>-portable.exe`、`hearthbox-android-<tag>[-debug].apk`、`SHA256SUMS.txt`
- 任何目标失败都不会发布（`publish` 依赖三个构建 job）

**还没做的**：

- `hbx publish` 发布签名 catalog（M2）
- Android 蓝牙手柄的原生输入桥（M4 剩余项）
- Windows 代码签名与自动更新
- 可安装 PWA（manifest + Service Worker；Windows 已改用安装包，PWA 只作为轻量入口保留）

## 9. 明确不做的事

- 不修改路由器、防火墙、DNS 等任何网络设备配置；文档只说明需要怎样的配置。
- 不在客户端里内置 ZeroTier 或任何 VPN。
- 不搭建账号服务器。v1 的"服务端"全部是静态文件。
