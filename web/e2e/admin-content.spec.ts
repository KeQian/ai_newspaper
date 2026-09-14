import { expect, test } from '@playwright/test';

test('content workspace exposes workflow filters without horizontal page overflow', async ({
  page,
}, testInfo) => {
  await page.goto('/admin/content?status=in_review');
  await expect(
    page.getByRole('heading', { level: 1, name: '内容管理' }),
  ).toBeVisible();
  await expect(page.getByPlaceholder('搜索内容标题')).toBeVisible();
  await expect(
    page.getByRole('navigation', { name: '内容状态' }),
  ).toBeVisible();
  await expect(page.getByRole('link', { name: '审核中' })).toHaveAttribute(
    'aria-current',
    'page',
  );

  if (testInfo.project.name === 'mobile-chromium') {
    await expect(page.getByText('AI Newspaper · 编辑台')).toBeVisible();
  } else {
    await expect(
      page.getByRole('navigation', { name: '后台导航' }),
    ).toBeVisible();
  }
  expect(
    await page.evaluate(
      () =>
        document.documentElement.scrollWidth <=
        document.documentElement.clientWidth,
    ),
  ).toBe(true);
});
