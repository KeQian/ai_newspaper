import { expect, test } from '@playwright/test';

test.describe('public archive resilience', () => {
  test('latest keeps filters and exposes a recoverable unavailable state', async ({
    page,
  }) => {
    await page.goto('/latest?importanceMin=4&verification=confirmed');
    await expect(
      page.getByRole('heading', { level: 1, name: '最新动态' }),
    ).toBeVisible();
    await expect(page.getByText('动态暂时无法读取')).toBeVisible();
    await expect(page.locator('select[name="importanceMin"]')).toHaveValue('4');
    await expect(page.locator('select[name="verification"]')).toHaveValue(
      'confirmed',
    );
    await expectNoHorizontalOverflow(page);
  });

  test('topics has a clear service state and no fake counts', async ({
    page,
  }) => {
    await page.goto('/topics');
    await expect(
      page.getByRole('heading', { level: 1, name: '主题' }),
    ).toBeVisible();
    await expect(page.getByText('主题暂时无法读取')).toBeVisible();
    await expectNoHorizontalOverflow(page);
  });

  test('future briefing is not fabricated', async ({ page }) => {
    const response = await page.goto('/briefing/2999-01-01');
    expect(response?.status()).toBe(404);
    await expect(
      page.getByRole('heading', { level: 1, name: '没有找到这个页面' }),
    ).toBeVisible();
  });
});

async function expectNoHorizontalOverflow(
  page: import('@playwright/test').Page,
) {
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
}
