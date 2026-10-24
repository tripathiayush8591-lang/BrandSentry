import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './e2e', workers: 1, fullyParallel: false,
  timeout: 45000, expect: { timeout: 10000 },
  reporter: [['list']],
  use: { baseURL: 'http://127.0.0.1:5174', viewport: { width: 1440, height: 960 }, timezoneId: 'Asia/Kolkata',
    // Traces/storage state can contain real session credentials: never persist them.
    trace: 'off', video: 'off', screenshot: 'off' },
  webServer: { command: 'npm run dev -- --port 5174 --strictPort', url: 'http://127.0.0.1:5174',
    env: { VITE_API_BASE_URL: 'http://127.0.0.1:8002' }, reuseExistingServer: false },
});
