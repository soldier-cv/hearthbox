# 包格式与货架

> 当前已实现：本地/URL/GitHub Release 的 `.hbx` 导入、安装到 IndexedDB、从货架启动、删除。未实现：catalog、签名、自动更新、回滚、沙箱。

## 1. 包（.hbx）

一个游戏包是一个 zip 文件，扩展名 `.hbx`：

```
neon-drift-1.2.0.hbx
├── game.json          # 清单，见 game-sdk.md
├── game.js            # 单文件 ESM，所有依赖内联（SDK 除外，见下）
├── icon.png           # 512×512，货架用
├── banner.png         # 1280×720，详情页用（可选）
└── assets/            # 任意子目录
    └── sprites.png
```

约束：

- 解压后总大小 ≤ 200MB；压缩包内文件数 ≤ 4000。超过的游戏需要等 `PackageStore` 的文件系统后端（见 decisions.md D5）。
- 路径只允许相对路径，拒绝 `..`、绝对路径、符号链接条目。
- `game.js` 不得包含 import maps 或任何 `import` 语句（裸导入、相对导入都不行）；包括 `@hearthbox/sdk` 在内的依赖全部由构建工具内联。包入口在 blob URL 下执行，裸说明符无法解析。
- 媒体文件只允许：png、jpg、webp、gif、json、txt、ogg、mp3、wav。

## 2. catalog.json

```json
{
  "name": "Hearthbox 官方",
  "version": 1,
  "generated": "2026-10-22T00:00:00Z",
  "games": [
    {
      "id": "author.neon-drift",
      "name": "霓虹漂移",
      "version": "1.2.0",
      "sdk": "^1.0.0",
      "url": "packages/author.neon-drift/1.2.0.hbx",
      "size": 1843200,
      "sha256": "hex…",
      "summary": "一句话介绍"
    }
  ]
}
```

- `url` 相对 catalog.json 所在位置，或绝对 HTTPS URL。
- 每个游戏只列**最新版本**；回滚用本地保留的上一版本，不依赖货架。

## 3. 签名

- 每个 catalog 源有一对 Ed25519 密钥。私钥只在发布机器上，公钥随客户端分发。
- 签名对 `catalog.json` 原始字节计算，存为同目录的 `catalog.json.sig`（base64）。
- 客户端：先验证签名，再信任内容。签名无效 → 整份 catalog 拒绝，保留上一份有效缓存。
- 官方源的公钥**编译进客户端**。
- 用户添加的第三方源：首次成功拉取时记录公钥（TOFU），之后公钥变化即拒绝并提示。
- 包本身不单独签名，完整性由 catalog 中的 `sha256` 保证；catalog 被签名保护。
- 实现用 `@noble/curves` 与 `@noble/hashes`，不依赖 Web Crypto（见 decisions.md D5）。

## 4. 安装流程

```
fetch(url) 流式读取
  ├─ 增量计算 sha256，同时写入临时 Blob
  ├─ 比对 catalog 条目的 sha256 与 size
  ├─ fflate 流式解压，逐个校验路径与文件类型
  ├─ 解析 game.json：id、version 与条目一致；sdk 范围可被本平台满足
  └─ 单个 IndexedDB 事务：
       files:    (id, version, path) → Blob
       installs: id → { version, previous, status:'ready', installedAt }
     成功后删除临时数据；失败则事务回滚，旧版本不动
```

- 下载中断可重试；不保留半成品。
- 保留**一个**旧版本用于回滚（设置页"还原上一版本"），再旧的在新版本确认可启动后删除。
- 卸载：删除 `files` 中该 id 的全部版本。存档默认保留，卸载确认框里可勾选"同时删除存档"。

## 5. 更新

- 货架启动时与每 6 小时刷新一次 catalog（只下载几十 KB）。
- 本地 `installs[id].version` < catalog 中的版本 → 标记"可更新"。
- 更新即安装新版本，旧版本自动成为 `previous`。
- 游戏运行中不更新；返回货架后才提示。

## 6. 本地存储布局（IndexedDB，数据库名 `hearthbox`）

| Store | Key | 值 |
|---|---|---|
| `files` | `[id, version, path]` | Blob |
| `installs` | `id` | `{ version, previous?, status, installedAt }` |
| `saves` | `[id, key]` | JSON 值 |
| `settings` | 字符串 | 音量、显示模式、源列表、按键语义等 |
| `profiles` | 设备匹配键（VID/PID 或 name） | 死区、轴映射、按钮重映射 |
| `catalog-cache` | 源 URL | 最近一份验签通过的 catalog 原文 |

启动时请求 `navigator.storage.persist()`，降低被浏览器回收的概率。

## 7. 多源

- 设置中可配置多个 catalog URL，按顺序合并，`id` 冲突时先配置的源优先。
- 每个源独立验签、独立缓存；一个源失败不影响其他源。
- 默认内置官方源；局域网镜像是"再加一个源"，不是另一种模式。

## 8. 发布

`tools/hbx` 提供一条命令完成发布：

```
hbx pack      # 构建游戏 → 单文件 ESM → 生成 game.json → 打 zip → 计算 sha256
hbx sign      # 用私钥重签 catalog.json
hbx publish   # 上传 .hbx 与 catalog 到目标（S3/R2/SSH 可配置）
```

私钥路径通过环境变量 `HBX_SIGNING_KEY` 传入，不进仓库。这条命令的顺滑程度决定以后做不做下一个游戏，优先打磨。

游戏仓库的 GitHub Actions 模板在 `templates/game/.github/workflows/`：`ci.yml` 在 PR 和 push 到默认分支时构建，并把 `.hbx` 作为运行产物上传；`release.yml` 只在 `v*` tag 或手动运行时构建，产出 `.hbx` 挂到 GitHub Release。平台的导入页填仓库地址，会取最新 Release 的 `.hbx`；Gitee 需要镜像到 GitHub 或在 Gitee Go 里执行同样的构建与打包命令。
