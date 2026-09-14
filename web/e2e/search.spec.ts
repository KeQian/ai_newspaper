import { expect, test } from '@playwright/test';

test('search page preserves URL filters and degrades clearly', async ({
  page,
}) => {
  await page.goto('/search?q=model&type=analysis&sort=latest');
  await expect(
    page.getByRole('heading', { level: 1, name: '搜索' }),
  ).toBeVisible();
  await expect(page.locator('main input[name="q"]')).toHaveValue('model');
  await expect(page.locator('main select[name="type"]')).toHaveValue(
    'analysis',
  );
  await expect(page.locator('main select[name="sort"]')).toHaveValue('latest');
  await expect(page.getByText('搜索服务暂时不可用。')).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
});

test('global shortcut opens an accessible search command', async ({ page }) => {
  await page.goto('/');
  await expect(
    page.getByRole('button', { name: /搜索（快捷键/ }),
  ).toHaveAttribute('data-ready', 'true');
  await page.keyboard.press('/');
  const dialog = page.getByRole('dialog', { name: '搜索 AI Signal' });
  await expect(dialog).toBeVisible();
  const input = dialog.getByRole('textbox', { name: '搜索关键词' });
  await expect(input).toBeFocused();
  await input.fill('model');
  await dialog.getByRole('button', { name: '搜索', exact: true }).click();
  await expect(page).toHaveURL(/\/search\?q=model$/);
});
