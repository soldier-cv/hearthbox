# Hearthbox 代理协作约定

本仓库会在多台设备、多个代理之间交替开发。除了仓库根目录上层的通用约定外，本项目额外遵守：

- 动手前先同步远端：`git fetch --all --prune`，有未提交改动先 `git stash push -u` 再 `git pull --ff-only`。
- 兼容基线是 Chromium 87（见 `docs/compatibility.md`）。不要使用基线以上的 API，除非同时提供检测和降级。
- 平台运行时的热路径（`packages/runtime` 的循环、输入、渲染）禁止每帧分配内存。
- 不要修改任何 origin / scheme 配置（`androidScheme`、hostname、Tauri 的 scheme）。改了会导致所有用户的存档与已安装游戏消失，见 `docs/decisions.md` D3。
- 不要引入 `docs/compatibility.md` 第 6 节标准之外的依赖；拿不准就先问。
- 私钥、keystore、`.env` 不进仓库。
- 架构决策有变化时，在 `docs/decisions.md` 追加新记录，不改写旧记录。
