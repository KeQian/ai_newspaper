import { defineConfig, devices } from '@playwright/test';

const localBrowser = process.env.CI ? {} : { channel: 'chrome' as const };
const baseURL = process.env.E2E_BASE_URL ?? 'http://127.0.0.1:4173';
const externalServer = process.env.E2E_EXTERNAL_SERVER === '1';

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    baseURL,
    trace: 'on-first-retry',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'], ...localBrowser },
    },
    {
      name: 'mobile-chromium',
      use: { ...devices['Pixel 7'], ...localBrowser },
    },
  ],
  webServer: externalServer
    ? undefined
    : {
        command: 'pnpm dev --host 127.0.0.1 --port 4173',
        url: baseURL,
        reuseExistingServer: !process.env.CI,
        timeout: 240_000,
      },
});
