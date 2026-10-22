# 金手指与调试口子

平台不实现游戏逻辑，所以也不实现"无限命"。但平台**必须**留出位置，让游戏能声明金手指、让玩家能开关、让状态能持久化。否则每个游戏都要自己写一套开关界面，而 TV 上没有键盘和鼠标，这件事根本做不成。

设计只有一条原则：**语义归游戏，状态归平台。**

## 1. 三层分工

```
游戏          声明金手指（id、名字、说明）   →  ctx.cheats.declare()
              每帧读开关，自己决定怎么写     →  ctx.cheats.enabled('inf-lives')
平台          持有开关状态、按游戏持久化     →  session.setCheat()
              未来的设置页 / 金手指面板      →  M3
```

平台不知道"无限命"在某个游戏里怎么实现，也不需要知道。它只知道这个游戏声明了一个叫 `inf-lives` 的开关，现在处于开还是关。

## 2. 游戏侧：声明与读取

```ts
export default defineGame({
  id: 'author.contra-like',

  async create(ctx) {
    ctx.cheats.declare({
      id: 'inf-lives',
      name: '无限命',
      description: '生命数锁在 30',
      severity: 'gameplay',
    });

    let lives = 3;

    return {
      update() {
        // 每帧读。开关在运行中随时可能变，不要缓存到闭包里。
        if (ctx.cheats.enabled('inf-lives')) lives = 30;
      },
    };
  },
});
```

| 字段 | 必填 | 说明 |
|---|---|---|
| `id` | 是 | 稳定 id，游戏内唯一，**发布后不要改**（改了会让已保存的开关失效） |
| `name` | 是 | 玩家看到的名字 |
| `description` | 否 | 一句话说明，设置页显示 |
| `defaultEnabled` | 否 | 默认 `false`。默认开启只能用于纯便利项 |
| `severity` | 否 | `cosmetic` / `gameplay`（默认）/ `destructive`，平台据此在 UI 上区分并决定是否二次确认 |

另外两个方法：

- `justEnabled(id)`：本帧内刚从"关"变为"开"。用于"改完立刻生效一次"的逻辑，比如立刻补满血。
- `all`：全部已声明的金手指，供游戏自己画调试面板。

**重复声明同一个 id 会抛错。** 两个功能抢一个开关是设计错误，应该在 `create` 阶段就暴露。

## 3. 平台侧：开关与持久化

```ts
session.setCheat('inf-lives', true);
session.cheats;  // 全部已声明的金手指
```

- 状态存在 IndexedDB 的 `cheats` 对象库里，键是 `[gameId, cheatId]`。
- **与存档分开存**：卸载游戏时不清除金手指状态，重装后玩家的选择还在。
- 退出时立刻落盘，不依赖节流窗口。
- 游戏回滚到旧版本、删掉了某个金手指时，存储里那条状态**不删**。万一再升回来，玩家的开关还在。

## 4. 为什么不提供"内存地址 + 值"的通用格式

FC 模拟器时代的金手指是 `地址:值` 的形式，但那是**模拟器**在管游戏内存。Hearthbox 的游戏是普通 JS 模块，变量在闭包里，平台没有可以打补丁的内存模型。

两种选择：

| 方案 | 结果 |
|---|---|
| 伪造一套 `地址:值` 接口 | 平台手里没有那块内存，接口只能是个摆设。更糟的是它会让人以为能用 |
| 让游戏声明语义 | 平台能管状态、能出界面、能持久化；游戏知道自己该怎么改 |

所以选后者。**需要真正内存补丁的场景（比如接模拟器核）走另一条路**：模拟器本身作为普通游戏包接入，由它实现自己的金手指格式，把结果映射成 `ctx.cheats` 的声明。这条路在 `roadmap.md` 的"以后"里，不在 v1。

## 5. 调试口子

`ctx.debug` 默认全关。关闭时**所有方法都是空操作**，游戏可以无条件调用，不必写 `if (debug)` 分支。

打开方式：宿主页 URL 加参数。

```
play.html?...&debug=1&seed=42&speed=0.5
```

| 参数 | 作用 |
|---|---|
| `debug=1` | 打开调试模式 |
| `seed=42` | 固定随机种子，交给游戏自己用（平台不改 `Math.random`） |
| `speed=0.5` | 时间缩放，`update(dt)` 的 dt 乘以它，范围 0.05–4 |

```ts
interface DebugApi {
  readonly enabled: boolean;
  readonly seed: number | null;
  readonly timeScale: number;
  onFrame(callback: (frame: number) => void): () => void;
  stepFrames(count: number): void;
  readonly paused: boolean;
  resume(): void;
}
```

- `stepFrames(n)`：暂停主循环，手动推进 n 帧。用来复现"第 143 帧才出现的 bug"。
- `onFrame`：每帧回调，帧号递增。用来在控制台打点。
- **平台不改 `Math.random`**：那会污染同页面的其他代码。种子只是传给游戏，由游戏自己决定用不用可复现的 PRNG。

## 6. 不做的事（v1）

- **游戏内金手指面板**：由平台在 M3 的设置页里做。游戏自己也可以画，读 `ctx.cheats.all` 即可。
- **金手指的分享/导入**：JSON 导出留到以后。存储格式已经是 `[gameId, cheatId] → boolean`，加导出不需要改模型。
- **反作弊**：这是单机平台，没有排行榜。金手指不需要隐藏。
- **运行时修改字节码**：Web 平台没有这个能力，也不打算模拟。
