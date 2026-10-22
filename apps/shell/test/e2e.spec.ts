import { expect, test } from '@playwright/test';

/**
 * 端到端：真浏览器、真运行时、真 IndexedDB。
 *
 * 手柄不能模拟，所以键盘输入源承担全部输入；这与 PC 开发时玩家的路径一致
 * （见 compatibility.md 第 5 节：Playwright 不能模拟真实手柄）。
 */

const PLAY =
  '/play.html?id=hearthbox.contract&base=%2Ffixtures%2Fcontract&entry=game.js&manifest=game.json';

/**
 * 每个用例前清空 IndexedDB，保证"已安装/已有存档"不会跨用例泄漏。
 * 用 Playwright 提供的 storageState 做不到这一点（IndexedDB 不在其中），
 * 所以在同一页面里先删库、再开始用例的导航。
 */
test.beforeEach(async ({ page }) => {
  await page.goto('/index.html');
  await page.evaluate(async () => {
    await new Promise<void>((resolve) => {
      const request = indexedDB.deleteDatabase('hearthbox');
      const done = (): void => resolve();
      request.onsuccess = done;
      request.onerror = done;
      request.onblocked = done;
    });
  });
});

/** 进入宿主页，并按一次键解锁音频、启动游戏。 */
async function startGame(page: import('@playwright/test').Page, url = PLAY): Promise<void> {
  await page.goto(url);
  await page.waitForLoadState('load');
  // 第一次按键：解锁 AudioContext 并挂上画布。
  await page.keyboard.press('Enter');
  const canvas = page.locator('canvas');
  await expect(canvas).toBeVisible({ timeout: 15_000 });
  // 等游戏真的开始出帧（第一帧画上背景），避免"画布在但当帧还没跑"。
  await expect.poll(async () => findBlock(page), { timeout: 10_000 }).not.toBeNull();
}

/** 扫描画布，返回亮色方块的中心与平均色。 */
async function findBlock(page: import('@playwright/test').Page) {
  return page.evaluate(() => {
    const canvas = document.querySelector('canvas');
    if (!canvas) return null;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    const { width, height } = canvas;
    const data = ctx.getImageData(0, 0, width, height).data;
    let sumX = 0;
    let sumY = 0;
    let count = 0;
    let rSum = 0;
    let gSum = 0;
    let bSum = 0;
    for (let y = 0; y < height; y += 2) {
      for (let x = 0; x < width; x += 2) {
        const i = (y * width + x) * 4;
        const r = data[i] ?? 0;
        const g = data[i + 1] ?? 0;
        const b = data[i + 2] ?? 0;
        // 方块是饱和亮色，背景 #0b0b0f 与参考点 #2a2a36 都远低于这个阈值
        if (r + g + b > 200) {
          sumX += x;
          sumY += y;
          rSum += r;
          gSum += g;
          bSum += b;
          count += 1;
        }
      }
    }
    if (!count) return null;
    return {
      x: Math.round(sumX / count),
      y: Math.round(sumY / count),
      rgb: [Math.round(rSum / count), Math.round(gSum / count), Math.round(bSum / count)],
    };
  });
}

test('从货架进入夹具，画布按逻辑分辨率整数放大', async ({ page }) => {
  await page.goto('/index.html');
  await expect(page.locator('h1')).toHaveText('炉边');
  await page.getByRole('button', { name: '开始' }).first().click();

  await expect(page).toHaveURL(/play\.html/);
  await page.waitForLoadState('load');
  await page.keyboard.press('Enter');
  const canvas = page.locator('canvas');
  await expect(canvas).toBeVisible({ timeout: 15_000 });

  const size = await canvas.evaluate((el) => ({
    width: (el as HTMLCanvasElement).width,
    height: (el as HTMLCanvasElement).height,
  }));

  // 320×180 的逻辑分辨率，整数缩放后宽高比必须是 16:9
  expect(size.width / size.height).toBeCloseTo(16 / 9, 2);
  expect(size.width % 320).toBe(0);
});

test('键盘能移动方块', async ({ page }) => {
  await startGame(page);

  const before = await findBlock(page);
  expect(before).not.toBeNull();

  await page.keyboard.down('KeyD');
  await page.waitForTimeout(700);
  await page.keyboard.up('KeyD');

  const after = await findBlock(page);
  expect(after).not.toBeNull();
  expect(after!.x).toBeGreaterThan(before!.x + 100);
  // 纵向不该漂移
  expect(Math.abs(after!.y - before!.y)).toBeLessThan(5);
});

test('按键换色并写入存档，刷新后位置与颜色都还在', async ({ page }) => {
  await startGame(page);

  await page.keyboard.down('KeyD');
  await page.waitForTimeout(600);
  await page.keyboard.up('KeyD');
  await page.keyboard.press('KeyJ');
  await page.waitForTimeout(1200);

  const before = await findBlock(page);
  expect(before).not.toBeNull();

  await page.reload();
  await page.waitForLoadState('load');
  await page.keyboard.press('Enter');
  await expect(page.locator('canvas')).toBeVisible();
  await page.waitForTimeout(400);

  const after = await findBlock(page);
  expect(after).not.toBeNull();

  // 位置：存档里的坐标被还原
  expect(Math.abs(after!.x - before!.x)).toBeLessThan(40);
  expect(Math.abs(after!.y - before!.y)).toBeLessThan(40);

  // 颜色：J 键换过色，刷新后应该还是新颜色
  for (let i = 0; i < 3; i += 1) {
    expect(Math.abs((after!.rgb[i] ?? 0) - (before!.rgb[i] ?? 0))).toBeLessThan(12);
  }
});

test('游戏抛错时显示崩溃页而不是白屏', async ({ page }) => {
  // 指向一个不存在的包：清单读取失败必须走崩溃页
  await page.goto('/play.html?id=nope&base=%2Ffixtures%2Fnope&entry=game.js&manifest=game.json');
  await page.waitForLoadState('load');

  const crash = page.locator('#crash');
  await expect(crash).toBeVisible({ timeout: 10_000 });
  await expect(page.locator('#crash-message')).not.toHaveText('');

  // 崩溃时把"按任意键开始"遮罩收起来，否则它会盖住崩溃页的按钮。
  await expect(page.locator('#gate')).toBeHidden();

  await page.getByRole('button', { name: '返回货架' }).click();
  await expect(page).toHaveURL(/index\.html/);
});

/* ------------------------------------------------------------------ */
/* 输入夹具：鼠标、键盘、手柄三条路径，都能单独把游戏玩起来            */
/* ------------------------------------------------------------------ */

const INPUTS =
  '/play.html?id=hearthbox.inputs&base=%2Ffixtures%2Finputs&entry=game.js&manifest=game.json';

/**
 * 进入输入夹具并等到游戏真的跑起来。
 *
 * 只等 canvas 不够：那一刻循环可能还没执行第一帧，扫描像素会得到 null。
 * 用轮询等"看得见方块"才是可靠的就绪判据。
 * 每次先清掉存档，保证起始位置可预期（这个夹具会把位置写盘）。
 */
async function startInputsGame(page: import('@playwright/test').Page): Promise<void> {
  await page.goto('/index.html');
  await page.evaluate(async () => {
    await new Promise<void>((resolve) => {
      const request = indexedDB.deleteDatabase('hearthbox');
      const done = (): void => resolve();
      request.onsuccess = done;
      request.onerror = done;
      request.onblocked = done;
    });
  });

  await page.goto(INPUTS);
  await page.waitForLoadState('load');
  await page.keyboard.press('Enter');
  await expect(page.locator('canvas')).toBeVisible({ timeout: 15_000 });
  await expect.poll(async () => findInputBlock(page), { timeout: 10_000 }).not.toBeNull();
}

/** 读取画布上饱和色方块的中心、尺寸与主色。 */
async function findInputBlock(page: import('@playwright/test').Page) {
  return page.evaluate(() => {
    const canvas = document.querySelector('canvas');
    if (!canvas) return null;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    const { width, height } = canvas;
    const data = ctx.getImageData(0, 0, width, height).data;
    let minX = Infinity;
    let maxX = -Infinity;
    let minY = Infinity;
    let maxY = -Infinity;
    let count = 0;
    let rSum = 0;
    let gSum = 0;
    let bSum = 0;
    for (let y = 0; y < height; y += 2) {
      for (let x = 0; x < width; x += 2) {
        const i = (y * width + x) * 4;
        const r = data[i] ?? 0;
        const g = data[i + 1] ?? 0;
        const b = data[i + 2] ?? 0;
        // 方块是饱和色（四个调色板色都满足 max-min > 40）；
        // 背景、十字准星（灰/白）、命中点阵（灰）都是低饱和。
        const max = Math.max(r, g, b);
        const min = Math.min(r, g, b);
        if (r + g + b > 180 && max - min > 40) {
          if (x < minX) minX = x;
          if (x > maxX) maxX = x;
          if (y < minY) minY = y;
          if (y > maxY) maxY = y;
          count += 1;
          rSum += r;
          gSum += g;
          bSum += b;
        }
      }
    }
    if (!count) return null;
    return {
      // 归一到逻辑坐标：游戏里是 320×180，扫描的是 backing store。
      cx: Math.round(((minX + maxX) / 2 / width) * 320),
      cy: Math.round(((minY + maxY) / 2 / height) * 180),
      w: Math.round(((maxX - minX) / width) * 320),
      h: Math.round(((maxY - minY) / height) * 180),
      rgb: [Math.round(rSum / count), Math.round(gSum / count), Math.round(bSum / count)],
    };
  });
}

/** 逻辑坐标 → 页面坐标。 */
async function logicalToPage(page: import('@playwright/test').Page, lx: number, ly: number) {
  const box = await page.locator('canvas').boundingBox();
  if (!box) throw new Error('no canvas box');
  return { x: box.x + (lx / 320) * box.width, y: box.y + (ly / 180) * box.height };
}

test('鼠标点击能移动方块（逻辑坐标换算正确）', async ({ page }) => {
  await startInputsGame(page);

  const before = await findInputBlock(page);
  expect(before).not.toBeNull();

  // 点到画面右下角附近的空白处：方块应被搬过去
  const box = await page.locator('canvas').boundingBox();
  expect(box).not.toBeNull();
  const target = { x: box!.x + box!.width * 0.75, y: box!.y + box!.height * 0.7 };
  await page.mouse.click(target.x, target.y);
  await page.waitForTimeout(250);

  const after = await findInputBlock(page);
  expect(after).not.toBeNull();
  // 目标点在逻辑坐标约 (240, 126)
  expect(after!.cx).toBeGreaterThan(before!.cx + 40);
  expect(after!.cy).toBeGreaterThan(before!.cy + 20);
});

test('鼠标点方块本体换色，且只触发一次', async ({ page }) => {
  await startInputsGame(page);

  const before = await findInputBlock(page);
  expect(before).not.toBeNull();

  // 点方块中心：先把它当成逻辑坐标，再换算到页面坐标
  const point = await logicalToPage(page, before!.cx, before!.cy);
  await page.mouse.click(point.x, point.y);
  await page.waitForTimeout(250);

  const after = await findInputBlock(page);
  expect(after).not.toBeNull();
  // 换了颜色（三个通道里至少一个明显变化），但位置没动
  const changed = after!.rgb.some((v, i) => Math.abs(v - (before!.rgb[i] ?? 0)) > 20);
  expect(changed).toBe(true);
  expect(Math.abs(after!.cx - before!.cx)).toBeLessThan(6);
});

test('鼠标滚轮能改变方块大小', async ({ page }) => {
  await startInputsGame(page);

  const before = await findInputBlock(page);
  expect(before).not.toBeNull();

  const box = await page.locator('canvas').boundingBox();
  await page.mouse.move(box!.x + box!.width / 2, box!.y + box!.height / 2);
  await page.mouse.wheel(0, -400);
  await page.waitForTimeout(250);

  const after = await findInputBlock(page);
  expect(after).not.toBeNull();
  expect(after!.w).toBeGreaterThan(before!.w + 2);
});

test('纯键盘也能玩：方向键移动，A 键换色', async ({ page }) => {
  await startInputsGame(page);

  const before = await findInputBlock(page);
  expect(before).not.toBeNull();

  await page.keyboard.down('ArrowRight');
  await page.waitForTimeout(700);
  await page.keyboard.up('ArrowRight');
  await page.waitForTimeout(150);

  const moved = await findInputBlock(page);
  expect(moved).not.toBeNull();
  // 90 逻辑像素/秒 × 0.7s ≈ 63，留出帧对齐的余量
  expect(moved!.cx).toBeGreaterThan(before!.cx + 30);

  await page.keyboard.press('KeyA');
  await page.waitForTimeout(200);
  const recolored = await findInputBlock(page);
  const colorChanged = recolored!.rgb.some((v, i) => Math.abs(v - (moved!.rgb[i] ?? 0)) > 20);
  expect(colorChanged).toBe(true);
});

test('货架列出两个夹具并标注支持的输入', async ({ page }) => {
  await page.goto('/index.html');
  const cards = page.locator('.game-card');
  await expect(cards).toHaveCount(2);
  await expect(cards.nth(1).locator('p.inputs')).toContainText('鼠标');
  await expect(cards.nth(0).locator('p.inputs')).toContainText('手柄');
});
