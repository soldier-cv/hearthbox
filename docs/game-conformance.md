# 游戏如何遵循平台架构

游戏在独立仓库里开发（见 decisions.md D12）。仓库一分开，平台就没法靠代码审查来约束游戏，所以约束做进工具链里，一共三道。三道都过了，游戏自然符合架构；任何一道不过，包都出不来。

## 1. 类型：编译期就偏离不了

游戏只依赖 `@hearthbox/sdk`，而 SDK 只导出类型和 `defineGame()`。

- 游戏的入口必须是 `defineGame()` 的返回值，生命周期签名（`create` / `update` / `render`）由类型固定，写错编译不过。
- `GameContext` 上有什么，游戏才能用什么。输入只有 `PadState`，没有 `navigator.getGamepads()`；存档只有 `storage.get/set`，没有直接碰 IndexedDB 的办法。
- SDK 不导出内部类型。平台以后重构运行时，游戏的编译结果不受影响。

类型管得住"诚实的代码"，管不住故意绕过类型的代码，所以还有第二道。

## 2. 脚手架：`hbx create` 生成的项目一开始就是对的

```
hbx create neon-drift
```

生成的仓库包含：

| 文件 | 作用 |
|---|---|
| `package.json` | 已依赖对应版本的 `@hearthbox/sdk`，脚本只留 `dev` 和 `build` |
| `vite.config.ts` | SDK 标记为 external；输出强制单文件；target 锁定 `chrome87` |
| `tsconfig.json` | `strict` 开启，target 与平台基线一致 |
| `game.json` | 填好了 `id`、`sdk` 范围、逻辑分辨率 |
| `src/main.ts` | 一个能跑的 `defineGame()` 骨架 |
| `.github/workflows/release.yml` | CI 只做 `hbx pack` 和上传，不含 Android 构建 |

游戏作者不需要自己配这些，也就不存在配错的空间。模板跟着 CLI 走，CLI 跟着平台发版。

## 3. 打包校验：`hbx pack` 拒绝不合规的包

打包时检查，任何一项失败就退出非 0，CI 发布不出去：

| 检查 | 挡住什么 |
|---|---|
| 入口是单个 ESM，**零裸导入、零相对 `import`**（`@hearthbox/sdk` 也必须内联） | 多文件模块、漏打包的依赖、blob URL 下解析不了的说明符 |
| 产物里不含禁用 API（`requestAnimationFrame` 驱动逻辑、`getGamepads`、`structuredClone`、`crypto.subtle` 等，清单同 compatibility.md） | 绕过类型直接调平台不支持的接口 |
| `game.json` 的 `id`、`version`、`sdk` 范围合法，且与构建所用 SDK 版本相符 | 清单与代码不一致 |
| 解压后体积 ≤ 200MB、文件数 ≤ 4000、路径无 `..`、无符号链接 | 破坏安装器假设的包 |
| 只含允许的媒体类型 | 运行时无法解码的资源 |
| 构建 target 为 `chrome87` | 用了基线以上语法 |

这些检查同时在平台侧再做一次：安装器解压时重复校验路径、体积、`sdk` 范围与 sha256（见 package-format.md）。客户端不信任构建工具，因为第三方游戏可能用了旧版或改过的 CLI。

## 4. 本地开发回路

游戏不需要把平台仓库克隆下来才能开发：

```
hbx dev
```

启动一个精简的平台宿主，只含运行时和一张空白货架，直接加载本地源码，保存即刷新。手柄、存档、暂停菜单的行为与正式平台一致，因为它用的就是同一份 `@hearthbox/runtime`。

等游戏需要在电视上验证时：

```
hbx pack
hbx publish --source http://<开发机>:8080
```

电视上的壳把开发机加为临时 catalog 源，安装后运行。这条回路不经过公网，也不需要签名密钥。

## 5. 平台升级时游戏怎么办

- SDK 主版本内只加不改（game-sdk.md 第 5 节），所以平台正常升级，已发布的游戏不用动。
- SDK 发版前，用独立的范例游戏仓库跑一次集成：打包、安装、启动、退出、存档。范例游戏挂了就说明 SDK 破坏了兼容，发不了版。
- 游戏的 CI 把 `@hearthbox/sdk` 固定在一个版本。要跟进新 SDK 时，游戏作者显式升级依赖、本地跑一遍、再发布。平台不会让游戏在不知情的情况下改行为。

## 6. 这三道管不住的事

玩法、数值、画面好不好看，工具管不了，也不该管。平台只保证：一个能打包出来的游戏，在任何一台装了壳的设备上都能被安装、启动、暂停、退出，并且不弄坏别的游戏的存档。
