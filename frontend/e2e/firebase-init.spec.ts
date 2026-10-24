import { test, expect } from '@playwright/test';

test('BROWSER_MOCK: real Firebase SDK initializes before starting Google sign-in', async ({ page }) => {
  // Keep the actual SDK and Vite bundles; block external identity requests.
  // Reaching the Google script loader proves initializeAuth succeeded. With
  // split App/Auth registries it throws before making this request.
  await page.route('**/*', (route) => {
    const url = new URL(route.request().url());
    if (url.pathname === '/api/v1/auth/me') {
      return route.fulfill({ status: 401, contentType: 'application/json', body: '{}' });
    }
    if (url.hostname !== '127.0.0.1') return route.abort();
    return route.continue();
  });
  await page.goto('/login');
  const loader = page.waitForRequest((request) => request.url().startsWith('https://apis.google.com/js/api.js'));
  await page.getByRole('button', { name: 'Continue with Google', exact: true }).click();
  await loader;
  // The offline provider failure must never grant access or disable guest retry.
  await expect(page.getByRole('alert')).toContainText('Google sign-in couldn’t be completed');
  await expect(page.getByRole('button', { name: 'Continue as Guest', exact: true })).toBeEnabled();
  await expect(page.getByRole('button', { name: 'Sign out', exact: true })).toHaveCount(0);
  const bundles = await page.evaluate(() => performance.getEntriesByType('resource')
    .map((entry) => entry.name).filter((name) => /\/@firebase_(app|auth)\.js\?/.test(name)));
  expect(bundles).toHaveLength(2);
  expect(bundles.every((url) => new URL(url).pathname.includes('/.vite/e2e/'))).toBe(true);
  expect(new Set(bundles.map((url) => new URL(url).searchParams.get('v'))).size).toBe(1);
});
