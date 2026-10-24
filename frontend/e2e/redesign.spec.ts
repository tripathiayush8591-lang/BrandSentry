import { test, expect, type Page } from '@playwright/test';
import { spawn, type ChildProcess } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';

const backend = resolve('../backend');
const python = process.env.BRANDSENTRY_TEST_PYTHON ?? resolve(backend, process.platform === 'win32' ? '.venv/Scripts/python.exe' : '.venv/bin/python');
const api = 'http://127.0.0.1:8002';
const evidence = resolve('evidence/phase3c-redesign');
let server: ChildProcess;

test.beforeAll(async () => {
  mkdirSync(evidence, { recursive: true });
  server = spawn(python, ['-m', 'uvicorn', 'app.main:app', '--host', '127.0.0.1', '--port', '8002'], {
    cwd: backend, windowsHide: true, stdio: 'ignore',
    env: { ...process.env, APP_ENV: 'development',
      DATABASE_URL: `sqlite:///${resolve(backend, '.data/phase3c-redesign.sqlite').replace(/\\/g, '/')}`,
      UPLOAD_DIR: resolve(backend, '.data/phase3c-redesign-uploads'),
      FRONTEND_ORIGINS: 'http://127.0.0.1:5174', GUEST_SESSIONS_PER_IP_PER_HOUR: '0',
      // Deliberately exercise honest deterministic fallback. No paid provider calls.
      GEMINI_API_KEY: '',
    },
  });
  await expect.poll(async () => {
    try { return (await fetch(`${api}/ready`)).status; } catch { return 0; }
  }, { timeout: 20000 }).toBe(200);
});
test.afterAll(async () => {
  if (!server || server.exitCode !== null) return;
  const exited = new Promise<void>((done) => server.once('exit', () => done()));
  server.kill();
  await exited;
});

async function guest(page: Page) {
  await page.goto('/login');
  await page.getByRole('button', { name: 'Continue as Guest', exact: true }).click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('On brand. Backed by evidence.');
  await page.evaluate(() => document.fonts.ready);
  await expect(page.getByTestId('state-connected')).toBeVisible();
  await expect(page.getByRole('region', { name: 'Governance metrics overview' })).not.toContainText('—');
}

async function fits(page: Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
}

test('LIVE_BACKEND: real guideline → rule → content → finding and evidence in both themes', async ({ page }) => {
  test.setTimeout(120000);
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await guest(page);
  await page.getByRole('switch', { name: 'Dark mode' }).uncheck();
  await page.screenshot({ path: resolve(evidence, 'overview-light.png'), fullPage: true, animations: 'disabled' });
  const nav = page.getByRole('complementary', { name: 'Sidebar navigation' });
  await nav.getByRole('link', { name: 'Brand Vault', exact: true }).click();
  await page.getByLabel('File (PDF or UTF-8 TXT, max 5MB)').setInputFiles({
    name: 'synthetic-policy.txt', mimeType: 'text/plain',
    buffer: Buffer.from('Synthetic demo policy\n\nNever promise guaranteed outcomes. EcoBlend marketing must use evidence and avoid guaranteed results.'),
  });
  await page.getByLabel('Document Title (Optional)').fill('Synthetic EcoBlend policy');
  await page.getByRole('button', { name: 'Upload & Ingest' }).click();
  await page.getByRole('button', { name: 'Approve', exact: true }).click();
  await expect(page.getByRole('cell', { name: 'Approved', exact: true })).toBeVisible();
  await page.screenshot({ path: resolve(evidence, 'vault-light.png'), fullPage: true, animations: 'disabled' });
  await page.getByRole('button', { name: /^Rules \(/ }).click();
  await page.getByRole('button', { name: 'Add Brand Rule' }).click();
  await page.getByLabel('Rule Name').fill('Synthetic guarantee restriction');
  await page.getByLabel('Search Pattern').fill('guaranteed');
  await page.getByLabel('Suggested Replacement (Optional)').fill('Results may vary.');
  await page.getByLabel('Rule Explanation / Guidance').fill('Synthetic brand policy prohibits unsupported guarantees.');
  await page.getByRole('button', { name: 'Save Rule' }).click();
  await expect(page.getByText('Synthetic guarantee restriction', { exact: true })).toBeVisible();

  await nav.getByRole('link', { name: 'Content Studio', exact: true }).click();
  await page.getByLabel('Campaign / Asset Title').fill('Synthetic EcoBlend campaign');
  await page.getByLabel('Marketing Copy / Proposed Content').fill('EcoBlend offers guaranteed outcomes and guaranteed results.');
  await page.screenshot({ path: resolve(evidence, 'studio-light.png'), fullPage: true, animations: 'disabled' });
  await page.getByRole('button', { name: 'Run Validation', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Evidence & Findings', exact: true })).toBeVisible();
  await expect(page.getByText('Deterministic Rule Evaluation Only', { exact: true })).toBeVisible();
  await expect(page.getByText('Suggested Alternative Phrasing', { exact: true }).first()).toBeVisible();
  await expect(page.getByText('Synthetic EcoBlend policy', { exact: true }).first()).toBeVisible();
  await page.screenshot({ path: resolve(evidence, 'findings-light.png'), fullPage: true, animations: 'disabled' });
  const runUrl = page.url();

  await page.getByRole('switch', { name: 'Dark mode' }).check();
  await page.screenshot({ path: resolve(evidence, 'findings-dark.png'), fullPage: true, animations: 'disabled' });
  await page.getByRole('link', { name: 'Back to All Runs' }).click();
  const inspect = page.getByRole('link', { name: /^Inspect run / });
  await expect(inspect).toHaveCount(1);
  await inspect.focus();
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(runUrl);
  await page.goto('/vault');
  await page.screenshot({ path: resolve(evidence, 'vault-dark.png'), fullPage: true, animations: 'disabled' });
  await page.goto('/studio');
  await page.screenshot({ path: resolve(evidence, 'studio-dark.png'), fullPage: true, animations: 'disabled' });
  await page.goto('/runs');
  await page.screenshot({ path: resolve(evidence, 'runs-dark.png'), fullPage: true, animations: 'disabled' });
  await page.goto('/');
  await page.screenshot({ path: resolve(evidence, 'overview-dark.png'), fullPage: true, animations: 'disabled' });

  await page.getByRole('switch', { name: 'Dark mode' }).uncheck();
  await page.goto('/runs');
  await page.screenshot({ path: resolve(evidence, 'runs-light.png'), fullPage: true, animations: 'disabled' });
  await page.getByRole('switch', { name: 'Dark mode' }).check();

  for (const width of [820, 390, 320]) {
    await page.setViewportSize({ width, height: 900 });
    for (const route of ['/', '/vault', '/studio', '/runs', new URL(runUrl).pathname]) {
      await page.goto(route);
      await expect(page.locator('main h1')).toBeVisible();
      await fits(page);
      if (route === '/vault' || route === '/runs') {
        const table = page.locator('table');
        await expect(table).toBeVisible();
        expect(await table.evaluate((el) => el.getBoundingClientRect().width)).toBeGreaterThanOrEqual(660);
      }
      if (width === 390) await page.screenshot({ path: resolve(evidence, `mobile-${route === '/' ? 'overview' : route.startsWith('/runs/') ? 'findings' : route.slice(1)}-dark.png`), fullPage: true, animations: 'disabled' });
    }
  }
  await page.getByRole('button', { name: 'Toggle navigation menu' }).click();
  await expect(page.getByTestId('mobile-menu')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('mobile-menu')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Toggle navigation menu' })).toBeFocused();
  expect(errors).toEqual([]);
});

test('LIVE_BACKEND: keyboard theme persistence, live system changes, reduced motion and contrast', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'dark', reducedMotion: 'reduce' });
  await guest(page);
  const toggle = page.getByRole('switch', { name: 'Dark mode' });
  await expect(toggle).toBeChecked();
  await toggle.focus();
  await page.keyboard.press('Space');
  await expect(toggle).not.toBeChecked();
  await expect(toggle).toBeFocused();
  expect(await toggle.evaluate((el) => getComputedStyle(el).outlineStyle)).toBe('solid');
  expect(await page.locator('.theme-orb').evaluate((el) => getComputedStyle(el).transitionDuration)).toBe('0s');
  await page.reload();
  await expect(toggle).not.toBeChecked();
  expect(await page.evaluate(() => localStorage.getItem('brandsentry_theme'))).toBe('light');
  await page.getByRole('button', { name: 'Use system theme' }).click();
  await expect(toggle).toBeChecked();
  await page.emulateMedia({ colorScheme: 'light', reducedMotion: 'reduce' });
  await expect(toggle).not.toBeChecked();

  for (const dark of [false, true]) {
    if (dark) await toggle.check();
    const cardBackground = await page.locator('.neu-card').last().evaluate((el) => getComputedStyle(el).backgroundColor);
    expect(await page.locator('.workspace-header').evaluate((el) => getComputedStyle(el).backgroundColor)).toBe(cardBackground);
    expect(await page.locator('.workspace-sidebar').evaluate((el) => getComputedStyle(el).backgroundColor)).toBe(cardBackground);
    const ratios = await page.evaluate(() => {
      const css = getComputedStyle(document.documentElement);
      const luminance = (hex: string) => {
        const c = hex.trim().replace('#', '').match(/../g)!.map((v) => parseInt(v, 16) / 255)
          .map((v) => v <= .04045 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4);
        return .2126 * c[0] + .7152 * c[1] + .0722 * c[2];
      };
      const contrast = (a: string, b: string) => {
        const l = [luminance(a), luminance(b)].sort((x, y) => y - x);
        return (l[0] + .05) / (l[1] + .05);
      };
      return [contrast(css.getPropertyValue('--color-text-primary'), css.getPropertyValue('--color-surface')),
        contrast(css.getPropertyValue('--color-text-muted'), css.getPropertyValue('--color-canvas')),
        contrast('#ffffff', css.getPropertyValue('--color-accent'))];
    });
    ratios.forEach((ratio) => expect(ratio).toBeGreaterThanOrEqual(4.5));
  }
  expect(await page.locator('main h1').evaluate((el) => getComputedStyle(el).fontFamily)).toContain('DynaPuff');
  expect(await page.locator('main p').first().evaluate((el) => getComputedStyle(el).fontFamily)).toContain('Inter');
  expect(await page.evaluate(() => document.fonts.check('16px Inter') && document.fonts.check('16px DynaPuff'))).toBe(true);
});
