import { expect, test } from '@playwright/test';

test('audit workspace explains redaction and fails closed without production auth', async ({
  page,
}) => {
  const health = await page.request.get('/api/v1/health');
  expect(health.status()).toBe(200);
  await expect(health.json()).resolves.toMatchObject({ status: 'ok' });
  await page.goto('/admin/audit');
  await expect(page.getByRole('heading', { name: '审计日志' })).toBeVisible();
  await expect(page.getByText('页面展示前会再次脱敏')).toBeVisible();
  await expect(page.getByRole('alert')).toContainText('审计数据暂时不可用');
  await expect(page.locator('body')).not.toHaveCSS('overflow-x', 'scroll');
});
