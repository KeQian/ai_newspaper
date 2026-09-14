import { expect, test } from '@playwright/test';

test('candidate queue exposes filters and responsive read-only protection', async ({
  page,
}, testInfo) => {
  await page.goto('/admin/candidates');

  await expect(
    page.getByRole('heading', { level: 1, name: '候选事件' }),
  ).toBeVisible();
  await expect(page.getByPlaceholder('搜索标题或事实摘要')).toBeVisible();
  await expect(page.getByRole('button', { name: '筛选' })).toBeVisible();

  if (testInfo.project.name === 'mobile-chromium') {
    await expect(page.getByText('移动端仅供查看')).toHaveCount(0);
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
