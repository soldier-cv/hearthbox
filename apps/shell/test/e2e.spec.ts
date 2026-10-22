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
  await page.getByRole('button', { name: '开始' }).click();

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
