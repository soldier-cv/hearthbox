import { expect, test } from '@playwright/test';

/**
 * 冒烟测试：只验证"能跑起来"的关键路径。
 *
 * 刻意保持少而快。手感、像素、存档时序这些交给人手动验收 ——
 * 把它们写成断言既慢又脆（之前按像素扫位移的用例就是这样翻车的）。
 */

const DEMO = '/play.html?id=hearthbox.demo&base=%2Fdemo';

/** 进游戏并等画布出现。 */
async function launch(page: import('@playwright/test').Page, url = DEMO): Promise<void> {
  await page.goto(url);
  await page.waitForLoadState('load');
  await page.keyboard.press('Enter');
  await expect(page.locator('canvas')).toBeVisible({ timeout: 10_000 });
}

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

test('货架能进游戏，画布按整数倍放大', async ({ page }) => {
  await page.goto('/index.html');
  await expect(page.locator('h1')).toHaveText('炉边');
  await page.getByRole('button', { name: '开始' }).click();

  await expect(page).toHaveURL(/play\.html/);
  await page.waitForLoadState('load');
  await page.keyboard.press('Enter');

  const canvas = page.locator('canvas');
  await expect(canvas).toBeVisible();

  const size = await canvas.evaluate((el) => ({
    width: (el as HTMLCanvasElement).width,
    height: (el as HTMLCanvasElement).height,
  }));
  expect(size.width / size.height).toBeCloseTo(16 / 9, 2);
  expect(size.width % 320).toBe(0);
});

test('游戏能启动且不崩', async ({ page }) => {
  await launch(page);
  await expect(page.locator('#crash')).toBeHidden();
  await page.waitForTimeout(300);
  await expect(page.locator('#crash')).toBeHidden();
});

test('游戏抛错时显示崩溃页', async ({ page }) => {
  await page.goto('/play.html?id=nope&base=%2Fnope');
  await page.waitForLoadState('load');

  await expect(page.locator('#crash')).toBeVisible({ timeout: 10_000 });
  await expect(page.locator('#crash-message')).not.toHaveText('');
  await page.getByRole('button', { name: '返回货架' }).click();
  await expect(page).toHaveURL(/index\.html/);
});

test('金手指面板自动列出游戏声明的项', async ({ page }) => {
  await launch(page);

  await page.locator('#cheat-btn').click();
  await expect(page.locator('.cheat-panel[data-scope="cheat"]')).toBeVisible();
  await expect(page.locator('.cheat-row')).toHaveCount(3);

  const names = await page.locator('.cheat-name').allTextContents();
  expect(names).toContain('移动速度');

  await page.locator('.cheat-close').click();
  await expect(page.locator('.cheat-panel')).toBeHidden();
});

test('设置与成就是同一套声明，按归属分开', async ({ page }) => {
  await launch(page);

  await page.locator('#setting-btn').click();
  await expect(page.locator('.cheat-panel[data-scope="setting"]')).toBeVisible();
  await expect(page.locator('.cheat-choice')).toHaveCount(3);
  await page.locator('.cheat-close').click();

  await page.locator('#status-btn').click();
  await expect(page.locator('.cheat-panel[data-scope="status"]')).toBeVisible();
  await expect(page.locator('.cheat-slider')).toHaveCount(0);
  await expect(page.locator('.cheat-toggle input')).toHaveCount(0);
});
