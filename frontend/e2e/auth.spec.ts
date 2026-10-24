import { test, expect, type Page } from '@playwright/test';
import { spawn, execFileSync, type ChildProcess } from 'node:child_process';
import { resolve } from 'node:path';
import { mkdirSync, writeFileSync } from 'node:fs';

const backend = resolve('../backend');
const python = process.env.BRANDSENTRY_TEST_PYTHON ?? resolve(backend, process.platform === 'win32' ? '.venv/Scripts/python.exe' : '.venv/bin/python');
const api = 'http://127.0.0.1:8002';
const db = resolve(backend, '.data/phase2b-e2e.sqlite').replace(/\\/g, '/');
const evidence = resolve('evidence/phase2b');
let server: ChildProcess;
async function startBackend() {
  server = spawn(python, ['-m', 'uvicorn', 'app.main:app', '--host', '127.0.0.1', '--port', '8002'], {
    cwd: backend, windowsHide: true, stdio: 'ignore',
    env: { ...process.env, DATABASE_URL: `sqlite:///${db}`, FRONTEND_ORIGINS: 'http://127.0.0.1:5174', GUEST_SESSIONS_PER_IP_PER_HOUR: '0' },
  });
  await expect.poll(async () => {
    try { return (await fetch(`${api}/ready`)).status; } catch { return 0; }
  }, { timeout: 20000 }).toBe(200);
}
async function stopBackend() {
  if (!server || server.exitCode !== null) return;
  const exited = new Promise<void>((done) => server.once('exit', () => done()));
  server.kill(); await exited;
}
async function enterGuest(page: Page) {
  await page.goto('/login');
  await expect(page.getByRole('button', { name: 'Continue as Guest', exact: true })).toBeEnabled();
  await page.getByRole('button', { name: 'Continue as Guest', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Sign out', exact: true })).toBeVisible();
}
test.beforeAll(async () => { mkdirSync(evidence, { recursive: true }); await startBackend(); });
test.afterAll(async () => { await stopBackend(); });

test('LIVE_BACKEND: incognito guest cookies, reload, restart, CSRF and logout evidence', async ({ page, context }) => {
  const errors: string[] = []; page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/vault');
  await expect(page).toHaveURL(/\/login$/);
  await enterGuest(page);
  const first = await (await context.request.get(`${api}/api/v1/auth/me`)).json();
  const cookies = await context.cookies();
  const session = cookies.find((cookie) => cookie.name === 'brandsentry_session');
  expect(session?.httpOnly).toBe(true); expect(session?.sameSite).toBe('Lax');
  expect(session?.expires).toBeGreaterThan(Date.now() / 1000);
  expect(await page.evaluate(() => document.cookie.includes('brandsentry_session='))).toBe(false);
  expect(await page.evaluate(() => document.cookie.includes('brandsentry_session-csrf='))).toBe(true);
  await page.reload(); await expect(page.getByText('Guest Demo', { exact: true })).toBeVisible();
  const denied = await context.request.post(`${api}/api/v1/auth/logout`); expect(denied.status()).toBe(403);
  await stopBackend(); await startBackend();
  await page.reload(); await expect(page.getByText('Guest Demo', { exact: true })).toBeVisible();
  const restored = await (await context.request.get(`${api}/api/v1/auth/me`)).json();
  expect(restored.user.id).toBe(first.user.id); expect(restored.workspace.id).toBe(first.workspace.id);
  await page.screenshot({ path: resolve(evidence, 'guest-desktop.png'), fullPage: true });
  const logoutResponse = page.waitForResponse((response) => response.url().endsWith('/auth/logout') && response.request().method() === 'POST');
  await page.getByRole('button', { name: 'Sign out', exact: true }).click();
  expect((await logoutResponse).status()).toBe(204);
  await expect(page).toHaveURL(/\/login$/);
  expect((await context.request.get(`${api}/api/v1/auth/me`)).status()).toBe(401);
  const after = await context.cookies();
  const retainedNames = after.filter((cookie) => cookie.name.startsWith('brandsentry_session')).map(({ name }) => name);
  // Playwright headers() omits cookie headers; headersArray() includes both.
  const deletionHeaders = (await (await logoutResponse).headersArray()).filter((header) => header.name.toLowerCase() === 'set-cookie');
  expect(retainedNames).toEqual([]);
  expect(deletionHeaders).toHaveLength(2);
  // Record only cookie names/flags, never cookie values or session credentials.
  writeFileSync(resolve(evidence, 'cookie-observation.json'), JSON.stringify({ coverage: 'LIVE_BACKEND + Chromium', sessionHttpOnly: session?.httpOnly,
    sameSite: session?.sameSite, restoredSameUserAndWorkspaceAfterRestart: true, logoutHttpStatus: 204, revokedSessionMeStatus: 401,
    logoutSetCookieHeaderPresent: deletionHeaders.length === 2, retainedCookieNames: retainedNames,
    cookieDeletionPassed: retainedNames.length === 0 }, null, 2));
  await page.reload(); await expect(page.getByRole('button', { name: 'Continue as Guest', exact: true })).toBeEnabled();
  await expect(page.getByRole('button', { name: 'Sign out', exact: true })).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('LIVE_BACKEND: expired SQLite session redirects after reload', async ({ page, context }) => {
  await enterGuest(page);
  const identity = await (await context.request.get(`${api}/api/v1/auth/me`)).json();
  // Only this dedicated test DB and this synthetic guest are modified.
  execFileSync(python, ['-c', 'import sqlite3,sys; c=sqlite3.connect(sys.argv[1]); c.execute("UPDATE auth_sessions SET expires_at=? WHERE user_id=?", ("2000-01-01 00:00:00",sys.argv[2])); c.commit(); c.close()', db, identity.user.id], { windowsHide: true });
  await page.reload(); await expect(page).toHaveURL(/\/login$/);
  expect((await context.request.get(`${api}/api/v1/auth/me`)).status()).toBe(401);
});

test('LIVE_BACKEND: guest workspaces remain isolated across incognito contexts', async ({ page, browser, context }) => {
  await enterGuest(page);
  const a = await (await context.request.get(`${api}/api/v1/auth/me`)).json();
  const other = await browser.newContext();
  try {
    const secondPage = await other.newPage(); await secondPage.goto('http://127.0.0.1:5174/login');
    await secondPage.getByRole('button', { name: 'Continue as Guest', exact: true }).click();
    await expect(secondPage.getByRole('button', { name: 'Sign out', exact: true })).toBeVisible();
    const b = await (await other.request.get(`${api}/api/v1/auth/me`)).json();
    expect(a.user.id).not.toBe(b.user.id); expect(a.workspace.id).not.toBe(b.workspace.id);
  } finally { await other.close(); }
});

test('BROWSER_MOCK: backend 503 never grants access', async ({ page }) => {
  await page.goto('/login');
  await page.route('**/api/v1/auth/guest', (route) => route.fulfill({ status: 503, contentType: 'application/json', body: '{}' }));
  await page.getByRole('button', { name: 'Continue as Guest', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('temporarily unavailable');
  await expect(page.getByRole('button', { name: 'Sign out' })).toHaveCount(0);
});

test('LIVE_BACKEND + BROWSER_FAULT: a stripped session cookie never grants access', async ({ page }) => {
  await page.goto('/login');
  await page.route('**/api/v1/auth/guest', async (route) => {
    // Real issuance, but simulate a browser/proxy discarding Set-Cookie. Never log its body.
    const response = await fetch(`${api}/api/v1/auth/guest`, { method: 'POST', headers: { Origin: 'http://127.0.0.1:5174' } });
    await route.fulfill({ status: response.status, contentType: 'application/json', body: await response.text() });
  });
  await page.getByRole('button', { name: 'Continue as Guest', exact: true }).click();
  await expect(page.getByRole('alert')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Sign out', exact: true })).toHaveCount(0);
});

test('LIVE_BACKEND: outage blocks restoration and recovery retains the real identity', async ({ page }) => {
  await enterGuest(page); await stopBackend();
  try {
    await page.reload();
    await expect(page.getByRole('heading', { name: 'Welcome to BrandSentry' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Sign out', exact: true })).toHaveCount(0);
  } finally { await startBackend(); }
  await page.getByRole('button', { name: 'Retry session check', exact: true }).click();
  await expect(page.getByText('Guest Demo', { exact: true })).toBeVisible();
});

for (const viewport of [{ width: 1586, height: 992, name: 'desktop' }, { width: 820, height: 1180, name: 'tablet' }, { width: 390, height: 844, name: 'mobile' }, { width: 320, height: 740, name: 'small-mobile' }]) {
  test(`LIVE_BACKEND: ${viewport.name} login layout and keyboard`, async ({ page }) => {
    await page.setViewportSize(viewport); await page.goto('/login');
    await expect(page.getByRole('button', { name: 'Continue as Guest', exact: true })).toBeEnabled();
    await page.keyboard.press('Tab'); await expect(page.getByRole('button', { name: 'Continue with Google', exact: true })).toBeFocused();
    await page.keyboard.press('Tab'); await expect(page.getByRole('button', { name: 'Continue as Guest', exact: true })).toBeFocused();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    if (viewport.width < 681) await expect(page.locator('.trust-art')).toBeHidden();
    // Capture the neutral reference state after separately verifying keyboard focus.
    await page.getByRole('heading', { name: /Welcome to/ }).click();
    await page.screenshot({ path: resolve(evidence, `login-${viewport.name}-chromium.png`), fullPage: true });
  });
}
