# 我的游戏

一个限时收集小游戏：30 秒内吃掉 5 个目标，吃到就升级。

> **这份文件是模板自带的样例。** 复制模板后，把下面所有内容改成你自己游戏的实际情况。
> 占位的地方已经用具体值填好了，照着改比从空白写快。

## 开工前必须加载的技能

**这一节不要删。** 下面这些技能提供了本文件没讲的方法论，
漏掉它们最容易产出"代码能跑但玩法空洞"的东西：

| 技能 | 什么时候必须用 |
|---|---|
| `game-design` | 定核心循环、数值平衡、难度曲线、玩家心理 |
| `2d-games` | sprite 组织、tilemap、碰撞检测、相机、屏幕震动 |
| `game-art` | 定色板、素材规格、动画风格、素材管线 |
| `game-audio` | 音效设计、音乐、自适应音频 |
| `hearthbox` | 平台契约本身（本游戏所在的平台） |
| `playwright-skill` 或 `ui-diff` | 验收时自动截图、视觉回归 |

**三条硬要求**：

1. 涉及**玩法设计**，先加载 `game-design` 再写代码
2. 涉及**画面**，先加载 `game-art`，把色板和素材规格定死
3. 涉及**2D 渲染与碰撞**，加载 `2d-games`

不确定该用哪套时，先加载 `game-development`——它是编排技能，会路由到对应的子技能。

## 这是什么

玩家在一个小房间里有 30 秒，吃掉随机出现的绿点。每吃 5 个升一级，等级越高经验需求越多。时间到就结束。

- **类型**：限时收集
- **核心动词**：吃（只有这一个）
- **一局时长**：约 30 秒
- **画面**：像素风 320×180
- **输入**：手柄 / 键盘 / 鼠标

## 现在处于什么阶段

**能玩的原型。** 核心循环已通：移动、收集、升级、计时、结算、存档。

下一步可以做的：加障碍物、加敌人、把 30 秒延长成多波次。

## 目录

```
my-game/
├── game.json          清单：id、版本、分辨率、需要哪些输入
├── package.json
├── src/
│   ├── main.ts        入口，defineGame()
│   ├── config.ts      常量：分辨率、颜色、体积（永不变）
│   ├── tuning.ts      可调量：速度、经验、出怪（金手指改这里）
│   └── round.ts       状态机：playing / won / lost
├── assets/tile.png    素材
└── docs/
    ├── pitch.md       玩法一页纸
    ├── systems.md     系统表：所有数值
    ├── art.md         美术规范：色板、网格、命名
    └── acceptance.md  验收清单
```

## 怎么跑起来

```bash
# 在游戏目录
pnpm install --ignore-workspace
npx vite build

# 在平台目录
cd ../hearthbox
pnpm dev
```

浏览器开 `127.0.0.1:5199`，货架上就有这个游戏。

**改完代码要重新 `npx vite build`。** 游戏是构建产物，Vite 的热更新只作用于平台壳，不会重新打包游戏。

调试参数：`play.html?...&debug=1&seed=42&speed=0.5`

## 游戏契约

这个游戏跑在 Hearthbox 平台上。**平台接管循环、输入、存档、UI 面板**，游戏只写逻辑和绘制。

入口：

```ts
import { defineGame } from '@hearthbox/sdk';

export default defineGame({
  id: 'me.my-game',        // 必须与 game.json 一致
  async create(ctx) {
    return {
      update(dt) {},      // 固定 60Hz，dt 恒为 1/60
      render(alpha) {},   // 每显示帧一次，alpha ∈ [0,1)
      pause() {}, resume() {}, dispose() {},
    };
  },
});
```

### 不许自己做的事

| 不要 | 为什么 |
|---|---|
| `requestAnimationFrame` | 循环归平台。自己跑会破坏暂停、插值、防死亡螺旋 |
| `setTimeout` 驱动逻辑 | 用 `update` 的 dt 累加。定时器在暂停时不会停 |
| `navigator.getGamepads()` | 输入归平台。Android TV 上 Gamepad API 不可靠，平台走原生桥 |
| `localStorage` / 直接开 IndexedDB | 存档归平台。不走平台的话清缓存就丢，且跨设备不通用 |
| 在 `update` 里画东西 | `update` 只算逻辑，`render` 只绘制 |
| 自己写暂停菜单 / 设置页 / 金手指面板 | 平台提供，自己写会不一致 |

### ctx 提供什么

```ts
ctx.ctx2d        // 2D 上下文，逻辑坐标系，平台负责缩放
ctx.width/height // 逻辑宽高
ctx.input        // 三层输入：p1（手柄层）/ keyboard / pointer
ctx.storage      // get/set/delete，同步读内存，异步落盘
ctx.audio        // ctx / music / sfx
ctx.assets       // image/audio/json/text
ctx.options      // 可调项：金手指、设置、成就
ctx.random       // 可设定种子，能复现整局行为
ctx.debug        // 调试口子，默认全关时是空操作
ctx.exit()       // 返回货架
```

完整契约见平台仓库 `docs/game-sdk.md`。

## 开发规范

### 数值分三层

```
config.ts   常量      分辨率、颜色、体积        永不变
tuning.ts   可调量    速度、经验、出怪、品质    金手指改这里
main.ts     逻辑      只读 tuning.xxx(base)    不写裸数字
```

**逻辑里不允许出现裸数值。** 改手感只改 `tuning.ts`。

### 金手指、设置、成就用同一套 API

```ts
// 金手指：数值型必须给范围
ctx.options.declare({
  id: 'move-speed',
  name: '移动速度',
  kind: 'number',
  min: 1, max: 3, step: 0.25, defaultValue: 1,
  unit: '×',
});

// 设置
ctx.options.declare({
  id: 'cursor-style', name: '指针样式',
  kind: 'choice', scope: 'setting',
  defaultValue: 'cross',
  choices: [{ value: 'cross', label: '十字' }],
});

// 成就（只读）
ctx.options.declare({ id: 'clicks', name: '累计点击', scope: 'status' });
```

平台会自动渲染成面板。**不要自己写界面。**

规则：

1. 金手指 `id` 发布后不改（改了玩家设置失效）
2. 只改**速率**，不改**进度结构**（经验倍率可以，直接改等级不行）
3. 用过金手指的局在存档里打标记

### 存档

```ts
const saved = ctx.storage.get<State>('state');
ctx.storage.set('state', state);
```

- 关键进度**立刻 set**，不要攒到关卡结束——Android 可能直接杀进程
- 单游戏上限 1MB，值必须是可序列化的纯数据
- 按 `game.json` 的 id 隔离，和其他游戏互不可见

### 性能

- `update` / `render` 里不创建可以避免的对象：复用向量，不每帧 new 数组或闭包
- 图片在 `create` 里加载完，不要在 `render` 里解码
- 像素游戏用 `pixelArt: true`，平台会关掉平滑

### 构建

产物必须**单文件 ESM、零 import**。SDK 要内联——包在 blob URL 下执行，裸说明符解析不了。

`vite.config.ts` 已经配好，不要改成 `external`。

### 提交规范

提交信息用中文，前缀用约定式：`feat:` `fix:` `docs:` `test:` `chore:`。

## 设计规范

写代码前先填 `docs/pitch.md`。**核心动词填不出来就说明玩法没想清楚，别开始写。**

四份文档，不多不少：

| 文档 | 什么时候填 | 填不出来会怎样 |
|---|---|---|
| `pitch.md` 玩法一页纸 | 动手前 | 写到一半发现玩法不成立 |
| `art.md` 美术规范 | **动手前** | 素材全部重画 |
| `systems.md` 系统表 | 动手前 | 数值散落，改一个数翻五个文件 |
| `acceptance.md` 验收清单 | 每个改动后 | 交付的东西其实不能玩 |

**美术规范必须最先定**：分辨率、色板 hex、sprite 网格、描边风格。定完不要改。

一份文档如果读完还是不知道下一步写哪行代码，它就不该存在。

## 验收标准

`typecheck` 通过**不算**跑通。改到玩家可见的东西，必须真的跑起来看一眼。

### 每次改动

- [ ] `pnpm dev` 起来了，游戏出现在货架上
- [ ] 点进去不是黑屏，没有崩溃页
- [ ] 控制台没有红色报错

### 发布前

- [ ] 键盘能完成一局
- [ ] 手柄能完成一局（如果有手柄）
- [ ] 鼠标操作准确（如果游戏用鼠标）
- [ ] 死亡后能重开
- [ ] 刷新页面后存档还在
- [ ] 连续玩 5 分钟不掉帧
- [ ] 截图存到 `evidence/`

## 硬性规矩

1. **不要改平台源码**。需要平台加东西，去提需求，不要在游戏仓库里绕过。
2. **不要碰 `hearthbox/`**。它是另一个仓库，有自己的规矩。
3. **`game.json` 的 `id` 发布后不可改**。改了玩家存档、设置、成就全部失效。
4. **`@hearthbox/sdk` 精确锁定版本**，不要写 `^`。升级要显式做，并跑一遍回归。
5. **不要引入 `compatibility.md` 第 6 节之外的依赖**。拿不准先问。
6. **私钥、`.env` 不进仓库**。

## 平台在哪

平台在 `../hearthbox/`。它的文档是事实来源：

| 想查什么 | 看哪份 |
|---|---|
| 游戏契约（生命周期、ctx 全字段） | `docs/game-sdk.md` |
| 三层输入 | `docs/input.md`、`docs/pointer.md` |
| 金手指与数值分层 | `docs/cheats.md`、`docs/tuning.md` |
| 兼容基线与性能预算 | `docs/compatibility.md` |
| 为什么这样设计 | `docs/decisions.md` |
| 跑不起来怎么查 | `docs/local-dev.md` |

本文件与平台文档冲突时，**以平台文档为准**。
