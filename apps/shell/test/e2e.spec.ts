/// <reference types="node" />
import { expect, test } from '@playwright/test';
import { strToU8, zipSync } from 'fflate';

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
  await page
    .locator('.game-card')
    .filter({ hasText: '演示游戏' })
    .getByRole('button', { name: '开始' })
    .click();

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
  await expect(page.locator('#menu-btn')).toBeVisible();

  await page.locator('#menu-btn').click();
  await page.getByRole('button', { name: /金手指/ }).click();
  await expect(page.locator('.cheat-panel[data-scope="cheat"]')).toBeVisible();
  await expect(page.locator('.cheat-row')).toHaveCount(3);

  const names = await page.locator('.cheat-name').allTextContents();
  expect(names).toContain('移动速度');

  await page.locator('.cheat-close').click();
  await expect(page.locator('.cheat-panel')).toBeHidden();
});

test('系统菜单可用键盘打开并操作金手指', async ({ page }) => {
  await launch(page);
  await expect(page.locator('#menu-btn')).toBeVisible();

  await page.keyboard.press('Escape');
  await expect(page.locator('.menu-panel')).toBeVisible();
  await expect(page.locator('.menu-item[data-active="true"]')).toContainText('继续游戏');

  await page.keyboard.press('ArrowDown');
  await expect(page.locator('.menu-item[data-active="true"]')).toContainText('金手指');
  await page.keyboard.press('Enter');

  await expect(page.locator('.cheat-panel[data-scope="cheat"]')).toBeVisible();
  await expect(page.locator('.cheat-slot[data-active="true"] .cheat-name')).toContainText(
    '移动速度',
  );

  await page.keyboard.press('ArrowRight');
  await expect(page.locator('.cheat-slot[data-active="true"] .cheat-value')).not.toHaveText('1×');

  await page.keyboard.press('ArrowDown');
  await expect(page.locator('.cheat-slot[data-active="true"] .cheat-name')).toContainText(
    '巨大的准星',
  );
  await page.keyboard.press('Space');
  await expect(
    page.locator('.cheat-slot[data-active="true"] input[type="checkbox"]'),
  ).toBeChecked();

  await page.keyboard.press('Escape');
  await expect(page.locator('.cheat-panel')).toBeHidden();
  await expect(page.locator('#hud')).toBeVisible();
});

test('导入 .hbx 后能从货架启动', async ({ page }) => {
  const manifest = {
    id: 'test.imported',
    name: '导入测试',
    summary: '从 .hbx 安装的测试游戏',
    version: '1.0.0',
    sdk: '^0.1.0',
    entry: 'game.js',
    display: { width: 320, height: 180, pixelArt: true, scale: 'integer' },
    players: { min: 1, max: 1 },
    input: ['pad', 'keyboard'],
    pointer: 'hidden',
    license: 'MIT',
  };
  const code = `
    export default {
      id: 'test.imported',
      create(ctx) {
        let ready = false;
        ctx.assets.text('hello.txt').then(() => {
          ready = true;
          globalThis.__assetLoaded = true;
        });
        return {
          update() {},
          render() {
            ctx.ctx2d.fillStyle = ready ? '#3f6' : '#f00';
            ctx.ctx2d.fillRect(0, 0, ctx.width, ctx.height);
          },
        };
      },
    };
  `;
  const zip = zipSync({
    'game.json': strToU8(JSON.stringify(manifest)),
    'game.js': strToU8(code),
    'assets/hello.txt': strToU8('hi'),
  });

  await page.goto('/import.html');
  await page.setInputFiles('#file', {
    name: 'test-import.hbx',
    mimeType: 'application/zip',
    buffer: Buffer.from(zip),
  });
  await expect(page.locator('#status')).toContainText('已安装：导入测试 1.0.0');

  await page.goto('/index.html');
  const card = page.locator('.game-card').filter({ hasText: '导入测试' });
  await expect(card).toBeVisible();
  await card.getByRole('button', { name: '开始' }).click();

  await page.waitForLoadState('load');
  await page.keyboard.press('Enter');
  const canvas = page.locator('canvas');
  await expect(canvas).toBeVisible({ timeout: 10_000 });

  const size = await canvas.evaluate((element) => ({
    width: (element as HTMLCanvasElement).width,
    height: (element as HTMLCanvasElement).height,
  }));
  expect(size.width / size.height).toBeCloseTo(16 / 9, 2);
  expect(size.width % 320).toBe(0);
  await page.waitForFunction(
    () => (window as unknown as { __assetLoaded?: boolean }).__assetLoaded === true,
  );

  await page.goto('/index.html');
  const imported = page.locator('.game-card').filter({ hasText: '导入测试' });
  await expect(imported).toBeVisible();
  page.once('dialog', (dialog) => {
    void dialog.accept();
  });
  await imported.getByRole('button', { name: '删除' }).click();
  await expect(imported).toHaveCount(0);
});

test('存档能在本机导出和导入', async ({ page }) => {
  const envelope = {
    format: 'hearthbox-save',
    formatVersion: 1,
    gameId: 'test.imported',
    gameVersion: '1.0.0',
    savedAt: new Date().toISOString(),
    data: { state: { level: 3 } },
  };

  await page.goto(
    '/saves.html?id=test.imported&name=%E5%AF%BC%E5%85%A5%E6%B5%8B%E8%AF%95&version=1.0.0',
  );
  await page.setInputFiles('#file', {
    name: 'save.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(envelope)),
  });
  await expect(page.locator('#status')).toContainText('已导入 1 个键');

  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: '导出当前存档' }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toContain('test.imported');
});

test('设置与成就是同一套声明，按归属分开', async ({ page }) => {
  await launch(page);
  await expect(page.locator('#menu-btn')).toBeVisible();

  await page.locator('#menu-btn').click();
  await page.getByRole('button', { name: /游戏设置/ }).click();
  await expect(page.locator('.cheat-panel[data-scope="setting"]')).toBeVisible();
  await expect(page.locator('.cheat-choice')).toHaveCount(3);
  await page.locator('.cheat-close').click();

  await page.locator('#menu-btn').click();
  await page.getByRole('button', { name: /成就与统计/ }).click();
  await expect(page.locator('.cheat-panel[data-scope="status"]')).toBeVisible();
  await expect(page.locator('.cheat-slider')).toHaveCount(0);
  await expect(page.locator('.cheat-toggle input')).toHaveCount(0);
});
