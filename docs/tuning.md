# 数值与金手指

> 一句话：**游戏里不允许出现裸数值。所有可调的东西走 `Tuning`，金手指只改 `Tuning`。**

## 为什么需要这层

金手指、难度、调试，三者改的是同一批数值。如果数值散在逻辑里（`this.speed * 1.5`、`1 + time/100`），每加一个金手指都要翻一遍代码，而且很容易漏。

集中之后：

- 加金手指只改一个文件
- 加难度档位只改一个文件
- 查"这个手感是哪来的"只看一个文件

## 三层的分工

```
config.ts    常量      分辨率、颜色、体积      运行中永不变
tuning.ts    可调量    速度、经验、出怪、品质  金手指/难度会改
main.ts      逻辑      只读 tuning，不碰数字
```

### config.ts —— 常量

```ts
export const CONFIG = {
  width: 320,
  height: 180,
  player: { speed: 90, size: 10 },
  colors: { player: '#f5a524', ... },
} as const;
```

这些**不会被金手指改**。分辨率改了素材要重画，颜色改了美术规范作废。

### tuning.ts —— 可调量

```ts
export interface Tuning {
  moveSpeed: (base: number) => number;
  xpNeed: (level: number) => number;
  enemyHp: (base: number) => number;
  spawnRate: (base: number) => number;
  offerQuality: (base: number) => number;
}

export const baseline: Tuning = {
  moveSpeed: (base) => base,
  xpNeed: (level) => Math.round(10 + level * 7 + Math.pow(level, 1.4)),
  enemyHp: (base) => base,
  spawnRate: (base) => base,
  offerQuality: (base) => base,
};
```

**每个函数都是"给定基础值，返回调整后的值"。** 这个签名是刻意的：金手指只是其中一种调整，难度、角色天赋、关卡修正都能套进来，调用点不用改。

### main.ts —— 只读

```ts
const speed = tuning.moveSpeed(C.player.speed);
player.x += move.x * speed * dt;      // 对
player.x += move.x * 90 * dt;         // 错：裸数值
player.x += move.x * C.player.speed * 1.5 * dt;  // 错：1.5 不在这张表里
```

## 金手指的两种形态

### 数值型（推荐）

```ts
ctx.cheats.declare({
  id: 'move-speed',
  name: '移动速度',
  kind: 'number',
  min: 1, max: 3, step: 0.25, defaultValue: 1,
  unit: '×',
});
```

**必须给 `min` / `max` / `step` / `defaultValue`。** 平台会：

- 据此生成设置页的滑杆
- 把越界值夹回范围
- 对齐到步进（不会出现 2.3333）
- 存档值超出新范围时**重新夹取**（老版本上限 10、新版本收到 5，读回来是 5 不是 10）

### 开关型

```ts
ctx.cheats.declare({ id: 'god-mode', name: '无敌', severity: 'destructive' });
```

`ctx.cheats.value('god-mode')` 返回 `0` / `1`，不抛错 —— 以后把开关升级成数值时，调用点不用改。

## 接线：只有一处知道金手指

```ts
export function tunedCheats(ctx: GameContext): Tuning {
  const cheats = ctx.cheats;
  return {
    moveSpeed: (base) => baseline.moveSpeed(base) * cheats.value('move-speed'),
    xpNeed: (level) => baseline.xpNeed(level) / cheats.value('xp-rate'),
    spawnRate: (base) => baseline.spawnRate(base) * cheats.value('spawn-rate'),
    offerQuality: (base) => baseline.offerQuality(base) * cheats.value('offer-quality'),
    enemyHp: (base) => baseline.enemyHp(base),
  };
}
```

**这是唯一知道"哪个金手指改哪个数值"的地方。** `main.ts` 完全不知道金手指存在。

加一个新金手指 = 加一行 declare + 在 `tunedCheats` 里加一行。

## 四条硬规则

**1. 不在逻辑里写裸数值。** 上面三条对比已经说明。

**2. 金手指 id 发布后不改。** 改了等于玩家的设置失效。所以 `CHEAT_IDS` 单独导出，方便 `hbx` 检查。

**3. 金手指不能改变"进度结构"，只能改"速率"。**

- 对：经验倍率（吃一个给 4 个的量）
- 错：直接改等级（关掉金手指后经验条对不上）

**4. 用了金手指的局要能标识。** 虽然你们是离线、没有排行榜，但存档里记一个标记仍然有用：排查问题时能知道这一局的数值不是原版。

```ts
ctx.storage.set('progress', { best, level, cheated: anyCheatEnabled });
```

## 验收怎么测

金手指最容易出两种 bug，都要测：

**数值越界**：`setCheat('move-speed', 999)`，读回来必须是 `max` 而不是 999。

**范围收窄**：上一版本上限 10、玩家调到 10；新版本上限改成 5，读回来必须是 5。

平台侧已有单元测试覆盖这两条（`packages/runtime/test/cheat-store.test.ts`）。游戏侧要测的是：**金手指改了之后，游戏行为真的变了**。模板里那条测法可以直接用：

```
默认速度 500ms 位移 ≈ 45
move-speed = 2 时 500ms 位移 ≈ 90
倍率符合预期
```
