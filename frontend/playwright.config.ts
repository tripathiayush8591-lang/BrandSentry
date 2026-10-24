import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './e2e', workers: 1, fullyParallel: false,
  timeout: 45000, expect: { timeout: 10000 },
  reporter: [['list']],
  use: { baseURL: 'http://127.0.0.1:5174', viewport: { width: 1440, height: 960 }, timezoneId: 'Asia/Kolkata',
    // Traces/storage state can contain real session credentials: never persist them.
    trace: 'off', video: 'off', screenshot: 'off' },
  webServer: { command: 'npm run dev -- --mode e2e --port 5174 --strictPort', url: 'http://127.0.0.1:5174',
    env: {
      VITE_API_BASE_URL: 'http://127.0.0.1:8002',
      // Synthetic web config lets the SDK initialization regression run offline.
      // Browser tests never sign in to the real Google/Firebase project.
      VITE_FIREBASE_API_KEY: 'synthetic-e2e-api-key',
      VITE_FIREBASE_AUTH_DOMAIN: 'brandsentry-68d05.firebaseapp.com',
      VITE_FIREBASE_PROJECT_ID: 'brandsentry-68d05',
      VITE_FIREBASE_APP_ID: 'synthetic-e2e-app-id',
    }, reuseExistingServer: false },
});
