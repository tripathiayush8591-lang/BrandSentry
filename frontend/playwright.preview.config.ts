import { defineConfig } from '@playwright/test';

// Runs the built frontend only. No backend, Firebase login or provider is needed.
export default defineConfig({
  testDir: './e2e', testMatch: 'preview.spec.ts', workers: 1,
  timeout: 45000, expect: { timeout: 10000 }, reporter: [['list']],
  use: { baseURL: process.env.PREVIEW_BASE_URL || 'http://127.0.0.1:4174', viewport: { width: 1440, height: 960 }, timezoneId: 'Asia/Kolkata', trace: 'off', video: 'off', screenshot: 'off' },
  webServer: process.env.PREVIEW_BASE_URL ? undefined : {
    command: 'npm run preview -- --host 127.0.0.1 --port 4174 --strictPort',
    url: 'http://127.0.0.1:4174', reuseExistingServer: false,
  },
});
