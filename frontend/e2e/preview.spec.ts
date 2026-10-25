import { test, expect } from '@playwright/test';

const screens = [
  ['Overview', '/preview', 'Your brand, in good hands.'],
  ['Brand Vault', '/preview/vault', 'Brand Knowledge Vault'],
  ['Content Studio', '/preview/studio', 'Content Studio'],
  ['Validation Runs', '/preview/runs', 'Validation Runs'],
  ['Evidence & Findings', '/preview/findings', 'Evidence & Findings'],
  ['Human Review', '/preview/review', 'Human review'],
  ['Insights', '/preview/insights', 'Governance insights'],
];

for (const mobile of [false, true]) {
  for (const dark of [false, true]) {
    test(`OFFLINE_SYNTHETIC: full dashboard ${mobile ? 'mobile' : 'desktop'} ${dark ? 'dark' : 'light'}`, async ({ page }) => {
      if (mobile) await page.setViewportSize({ width: 390, height: 844 });
      const requests: string[] = [];
      const errors: string[] = [];
      page.on('pageerror', error => errors.push(error.message));
      page.on('request', request => { if (/\/api\/|localhost:800|127\.0\.0\.1:800|googleapis\.com|identitytoolkit|securetoken/.test(request.url())) requests.push(request.url()); });
      // Even if an API accidentally gets wired in, the backend is unavailable.
      await page.route('**/api/**', route => route.abort('failed'));
      await page.goto('/preview');
      const theme = page.getByRole('switch', { name: 'Dark mode' });
      if ((await theme.getAttribute('aria-checked') === 'true') !== dark) await theme.click();
      for (const [label, path, heading] of screens) {
        if (mobile) await page.getByRole('button', { name: 'Toggle navigation menu' }).click();
        await page.getByRole('link', { name: label, exact: true }).filter({ visible: true }).click();
        await expect(page).toHaveURL(new RegExp(`${path}$`));
        await expect(page.getByText('Guest Demo — Synthetic Data', { exact: true })).toBeVisible();
        await expect(page.getByRole('heading', { name: heading, exact: true }).first()).toBeVisible();
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
        await expect(theme).toHaveAttribute('aria-checked', String(dark));
      }
      await page.reload();
      await expect(page.getByRole('heading', { name: 'Governance insights' })).toBeVisible();
      await expect(theme).toHaveAttribute('aria-checked', String(dark));
      expect(requests).toEqual([]);
      expect(errors).toEqual([]);
    });
  }
}

test('OFFLINE_SYNTHETIC: sample drilldowns, evidence, claims, disabled writes and invalid IDs', async ({ page }) => {
  const apiRequests: string[] = [];
  page.on('request', request => { if (request.url().includes('/api/')) apiRequests.push(request.url()); });
  await page.goto('/preview/studio');
  await page.getByRole('button', { name: /Autumn launch/ }).click();
  await expect(page.getByLabel('Marketing Copy / Proposed Content')).toHaveValue(/BrewNest Coffee guarantees/);
  await expect(page.getByRole('button', { name: 'Save New Revision' })).toBeDisabled();
  for (const button of await page.getByRole('button', { name: 'Check content' }).all()) await expect(button).toBeDisabled();
  await page.goto('/preview/runs');
  await page.getByRole('link', { name: 'Inspect run brewnest-run-1' }).click();
  await expect(page.getByRole('heading', { name: 'Review history' })).toBeVisible();
  await expect(page.getByText('Simulated review history', { exact: false }).first()).toBeVisible();
  await expect(page.getByRole('button', { name: 'Approve', exact: true })).toBeDisabled();
  await expect(page.getByText('NEEDS_VERIFICATION', { exact: false }).first()).toBeVisible();
  await page.goto('/preview/vault');
  await page.getByRole('button', { name: /^Claims \(/ }).click();
  await expect(page.getByText(/BrewNest House Blend is 100% Arabica/)).toBeVisible();
  await page.goto('/preview/runs/unknown');
  await expect(page.getByText(/Could not load review/)).toBeVisible();
  await page.goto('/preview/unknown');
  await expect(page.getByRole('heading', { name: 'Page Not Found' })).toBeVisible();
  await page.getByRole('link', { name: 'Return to Overview' }).click();
  await expect(page).toHaveURL(/\/preview$/);
  expect(apiRequests).toEqual([]);
});
