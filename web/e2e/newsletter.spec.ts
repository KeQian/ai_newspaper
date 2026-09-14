import { expect, test } from '@playwright/test';

test('public newsletter explains consent and supports keyboard submission', async ({
  page,
}) => {
  await page.goto('/newsletter');
  await expect(
    page.getByRole('heading', { name: '少刷信息流，把重要变化读明白' }),
  ).toBeVisible();
  await expect(page.getByText('双重确认 · 随时退订')).toBeVisible();
  await expect(page.getByLabel('工作邮箱')).toBeVisible();
  await expect(page.getByText('我同意接收 AI Signal 邮件')).toBeVisible();
  await expect(page.locator('body')).not.toHaveCSS('overflow-x', 'scroll');
});

test('confirmation links remove the token from browser history before showing a safe failure', async ({
  page,
}) => {
  await page.goto(`/newsletter?confirm=${'a'.repeat(40)}`);
  await expect(page).toHaveURL(/\/newsletter$/u);
  await expect(page.getByRole('status')).toContainText('链接无效或已过期');
  await expect(page.locator('body')).not.toContainText('a'.repeat(40));
});

test('newsletter admin exposes the editorial workflow and fails closed when unavailable', async ({
  page,
}) => {
  await page.goto('/admin/newsletters');
  await expect(page.getByRole('heading', { name: 'Newsletter' })).toBeVisible();
  await expect(
    page.getByText('只有 ChiefEditor 或 Admin 可正式发送'),
  ).toBeVisible();
  await expect(page.getByRole('alert')).toContainText(
    'Newsletter 数据暂时不可用',
  );
  await expect(page.getByRole('alert')).not.toContainText('@');
  await expect(page.locator('body')).not.toHaveCSS('overflow-x', 'scroll');
});
