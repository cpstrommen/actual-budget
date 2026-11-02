import path from 'node:path';

import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: 'preview-e2e',
  timeout: 60000,
  workers: 1,
  reporter: [['list']],
  use: {
    baseURL: process.env.E2E_PREVIEW_URL || 'http://127.0.0.1:3012',
    browserName: 'chromium',
    userAgent: 'playwright',
    screenshot: 'only-on-failure',
  },
  webServer: process.env.E2E_PREVIEW_URL
    ? undefined
    : {
        cwd: path.resolve(__dirname, '../..'),
        command: 'yarn preview:ui --no-open --port 3012',
        url: 'http://127.0.0.1:3012/__cfm-preview',
        timeout: 240000,
        reuseExistingServer: !process.env.CI,
      },
});
