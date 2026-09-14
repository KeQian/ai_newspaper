import { expect, test } from '@playwright/test';

test('homepage exposes a resilient editorial shell', async ({
  page,
}, testInfo) => {
  await page.goto('/');

  await expect(page).toHaveTitle(/AI Signal/);
  await expect(page.getByRole('heading', { level: 1 })).toContainText(
    '内容暂时无法读取',
  );
  const navigation = page.locator('nav[aria-label="主导航"]');
  if (testInfo.project.name === 'mobile-chromium') {
    await expect(navigation).toBeHidden();
    await page.locator('summary[aria-label="打开菜单"]').click();
    await expect(
      page.getByRole('navigation', { name: '移动端导航' }),
    ).toBeVisible();
  } else {
    await expect(navigation).toBeVisible();
  }
  const hasHorizontalOverflow = await page.evaluate(
    () =>
      document.documentElement.scrollWidth >
      document.documentElement.clientWidth,
  );
  expect(hasHorizontalOverflow).toBe(false);
});

test('methodology page explains human publication control', async ({
  page,
}) => {
  await page.goto('/methodology');

  await expect(
    page.getByRole('heading', { level: 1, name: '从候选线索到可验证内容' }),
  ).toBeVisible();
  await expect(page.getByText(/自动化和 AI 不得发布/)).toBeVisible();
  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute(
    'href',
    /\/methodology$/,
  );
  expect(
    await page.evaluate(
      () =>
        document.documentElement.scrollWidth <=
        document.documentElement.clientWidth,
    ),
  ).toBe(true);
});

test('unknown route provides a recovery link', async ({ page }) => {
  await page.goto('/missing-page');

  await expect(page.getByRole('heading', { level: 1 })).toHaveText(
    '没有找到这个页面',
  );
  await expect(page.getByRole('link', { name: '返回首页' })).toHaveAttribute(
    'href',
    '/',
  );
});
