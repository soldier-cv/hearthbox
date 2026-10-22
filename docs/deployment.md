# 部署

## 1. 两个环境

| | 开发 | 正式 |
|---|---|---|
| 平台本体 | Vite dev server（PC 上） | Android：打进 APK；Windows：PWA，静态托管 |
| 货架 catalog | 本地 `tools/hbx serve` 或正式源 | 公网 HTTPS 静态托管 |
| 电视如何访问 | Capacitor `server.url` 指向 PC，热更新 | 安装 APK |
| 网络 | 局域网 / ZeroTier | 公网；ZeroTier 仅作可选镜像 |

原则：**正式环境不依赖任何一台家里的机器开着**。ZeroTier 是开发工具，不是运行依赖。

## 2. 域名规划（占位，实施时替换）

| 主机名 | 用途 |
|---|---|
| `play.example.com` | Windows PWA 与货架前端 |
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

日常：

```
pnpm --filter @hearthbox/shell dev --host      # Vite 监听 0.0.0.0:5173
adb shell am start -n app.hearthbox/.MainActivity
```

- 调试构建中，壳读取开发配置里的 `server.url`（`http://<开发机>:5173`），WebView 直接加载 dev server，保存即热更新。
- 该地址是 HTTP 且非 localhost，**不是安全上下文**：Gamepad API、Web Crypto 不可用。这不影响开发，因为 Android 的手柄走原生桥，签名校验用 `@noble/*`。
- 调试用桌面 Chrome 打开 `chrome://inspect` 连接电视 WebView。
- `server.url` 只存在于本地调试配置，不进版本库。

发版构建：

```
pnpm --filter @hearthbox/shell build
pnpm --filter @hearthbox/android sync
# 产出 debug / 签名 release APK
adb install -r hearthbox-release.apk
```

APK 侧载更新会保留应用数据（origin 不变，见 decisions.md D3）。

## 7. Windows

- 开发：浏览器打开 `http://localhost:5173`。
- 正式：访问 `https://play.example.com`，浏览器菜单"安装应用"得到 PWA，离线可用（壳本身由 Service Worker 缓存）。
- 全屏：PWA 以 `display: fullscreen` 安装，或在应用内请求全屏。

## 8. CI（GitHub Actions）

每次推送与 PR：

1. `pnpm install --frozen-lockfile`
2. lint + typecheck + unit test
3. 构建所有包
4. Playwright 端到端（用伪造输入源，不需要真手柄）
5. `assembleDebug` 验证 Android 工程可编译

打 tag 时：

- 构建并签名 release APK，附到 GitHub Release
- 运行 `hbx publish` 发布 catalog（签名密钥来自仓库 secret）

## 9. 明确不做的事

- 不修改路由器、防火墙、DNS 等任何网络设备配置；文档只说明需要怎样的配置。
- 不在客户端里内置 ZeroTier 或任何 VPN。
- 不搭建账号服务器。v1 的"服务端"全部是静态文件。
