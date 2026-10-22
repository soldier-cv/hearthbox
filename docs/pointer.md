# 鼠标与触控

平台的目标不是"只做手柄游戏"。很多小游戏只需要点一点：翻牌、扫雷、点选、拖拽、滚轮缩放。这类游戏不该为了上平台被迫先做一套手柄映射。

原则：**指针是独立的一层输入，不是手柄的替代品。** 三类设备可以同时工作。

## 1. 一条路径覆盖鼠标、触控、触控笔

用 Pointer Events，不用分别写 `mousedown` 与 `touchstart`：

- Chromium 87 就支持 Pointer Events，在基线内。
- 触摸、鼠标、触控笔都产生同一组事件，只有一个 `pointerdown` / `pointerup` / `pointermove`。
- 触摸的语义天然就是"点一下"，不需要第二套代码。

## 2. 坐标：游戏永远看到逻辑像素

指针事件的原始值是**客户端坐标**（相对视口）。平台在汇总时用画布的 `getBoundingClientRect()` 换算：

```
逻辑 x = (clientX - rect.left) / rect.width  * 逻辑宽
逻辑 y = (clientY - rect.top)  / rect.height * 逻辑高
```

所以：

- 逻辑分辨率 320×180、画布被整数放大到 1280×720 时，点在屏幕正中心得到 `pointer.x === 160`、`pointer.y === 90`。
- 游戏不需要知道缩放倍数，也不需要自己乘除。
- 用 `getBoundingClientRect()` 而不是自己记 scale：画布可能被 CSS 变换影响（10-foot 模式的整体缩放），只有真实包围盒可靠。

## 3. 游戏里怎么用

```ts
render() {
  const p = ctx.input.pointer;
  if (p.connected && p.inside) {
    // 悬停高亮
    if (hitTest(p.x, p.y)) drawHighlight();
  }
}

update() {
  const p = ctx.input.pointer;
  if (p.pressed('left') && p.inside) {
    // 点中什么
  }
  if (p.wheel !== 0) {
    zoom -= p.wheel * 0.05;
  }
}
```

要点：

- `pressed` 只在**一帧**为真，和手柄的边沿语义一致。不会因为按住就每帧触发。
- `wheel` 是**本帧累计**，读一次就清零。向下滚为正。
- `inside` 为假时不要响应点击：那是在画布外面点的。
- `dx` / `dy` 是相对上一帧的位移，拖拽用这个，不要自己存上次坐标。

## 4. 指针外观

游戏在 `game.json` 里声明初始形态：

```json
{
  "input": ["pad", "keyboard", "pointer"],
  "pointer": "visible"
}
```

| 值 | 效果 | 适合 |
|---|---|---|
| `hidden` | 隐藏系统指针，游戏自己画 | 纯手柄游戏、全屏射击 |
| `visible` | 系统默认箭头（缺省） | 点击类小游戏 |
| `pointer` | 强制手型 | 可点区域很明确的界面 |

运行中可以切换：

```ts
ctx.setPointerMode('hidden');   // 打开全屏动画时
ctx.setPointerMode('visible');  // 回到菜单时
```

## 5. 为什么不把鼠标塞进 PadState

曾经考虑过"鼠标点击映射成 south 键"，这样所有游戏自动支持鼠标。没有采用：

- 位置信息会丢。点在 (240, 130) 和点在 (10, 10) 都变成"按了 south"，对点击类游戏毫无意义。
- 滚轮无处安放。
- 拖拽需要持续坐标，按钮语义表达不了。

所以指针是独立的一层。想同时支持两种设备的游戏，两层都读即可，代价只是几行。

## 6. 与手柄层的关系

同一帧里，`p1.move` 可以来自摇杆，`pointer.x/y` 来自鼠标，`keyboard.held('ShiftLeft')` 来自键盘。平台不会因为"检测到鼠标"就禁用摇杆，也不会因为"插了手柄"就隐藏指针。设备切换对游戏是透明的。

唯一的例外是**货架 UI**：它只读 `p1`（手柄层），所以手柄、方向键、遥控器在货架上行为一致。鼠标在货架上直接可点，因为那是 DOM 元素，不需要经过运行时。

## 7. 不做的事（v1）

- **文本输入**：输入框、中文输入法不在范围内。需要打字的游戏等 v2。
- **多点触控**：只跟踪一个主指针。双指缩放等手势不做。
- **指针锁定**（Pointer Lock）：第一人称视角需要它，但和 10-foot 电视场景冲突，v1 不做。
- **右键菜单拦截**：只拦画布上的 `contextmenu` 默认行为，其余保持浏览器默认。
