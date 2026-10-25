import { test, expect } from '@playwright/test';

for (const status of [401, 403, 502]) {
  test(`BROWSER_MOCK: session HTTP ${status} exposes login and honest read-only preview`, async ({ page }) => {
    await page.route('**/api/v1/auth/me', (route) => route.fulfill({ status, json: {} }));
    await page.goto('/');
    await expect(page.getByRole('heading', { name: 'Welcome to BrandSentry' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Continue as Guest', exact: true })).toBeEnabled({ enabled: status === 401 });
    if (status !== 401) await expect(page.getByRole('button', { name: 'Retry session check' })).toBeVisible();
    const mutations: string[] = [];
    page.on('request', (request) => { if (request.method() !== 'GET') mutations.push(request.method()); });
    await page.getByRole('link', { name: 'Explore Guest Demo' }).click();
    await expect(page.getByText('Guest Demo — Synthetic Data', { exact: true })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Your brand, in good hands.' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Sign out', exact: true })).toHaveCount(0);
    await page.getByRole('switch', { name: 'Dark mode' }).click();
    await page.setViewportSize({ width: 390, height: 844 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.reload();
    await expect(page.getByText('Guest Demo — Synthetic Data', { exact: true })).toBeVisible();
    expect(mutations).toEqual([]);
  });
}
