import { test, expect } from '@playwright/test';
import { spawn, execFileSync, type ChildProcess } from 'node:child_process';
import { resolve } from 'node:path';

const backend = resolve('../backend');
const python = process.env.BRANDSENTRY_TEST_PYTHON ?? resolve(backend,
  process.platform === 'win32' ? '.venv/Scripts/python.exe' : '.venv/bin/python');
const api = 'http://127.0.0.1:8002';
let server: ChildProcess;

test.beforeAll(async () => {
  server = spawn(python, ['-m', 'uvicorn', 'app.main:app', '--host', '127.0.0.1', '--port', '8002'], {
    cwd: backend, windowsHide: true, stdio: 'ignore',
    env: { ...process.env, APP_ENV: 'development', GEMINI_API_KEY: '',
      DATABASE_URL: `sqlite:///${resolve(backend, '.data/vault-upload-e2e.sqlite').replace(/\\/g, '/')}`,
      UPLOAD_DIR: resolve(backend, '.data/vault-upload-e2e-files'),
      FRONTEND_ORIGINS: 'http://127.0.0.1:5174', GUEST_SESSIONS_PER_IP_PER_HOUR: '0' },
  });
  await expect.poll(async () => {
    try { return (await fetch(`${api}/ready`)).status; } catch { return 0; }
  }, { timeout: 20000 }).toBe(200);
});

test.afterAll(async () => {
  if (!server || server.exitCode !== null) return;
  const exited = new Promise<void>((done) => server.once('exit', () => done()));
  server.kill(); await exited;
});

for (const extension of ['txt', 'pdf']) {
  test(`LIVE_BACKEND: ${extension} selection survives picker focus and uploads with extraction`, async ({ page }) => {
    await page.goto('/login');
    await page.getByRole('button', { name: 'Continue as Guest', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Sign out', exact: true })).toBeVisible();
    await page.goto('/vault');
    const text = 'Synthetic upload policy: never promise guaranteed outcomes.';
    const buffer = extension === 'txt' ? Buffer.from(text) : execFileSync(python, ['-c',
      'import pymupdf,sys; d=pymupdf.open(); p=d.new_page(); p.insert_text((72,72),sys.argv[1]); sys.stdout.buffer.write(d.tobytes())', text], { windowsHide: true });
    const file = { name: `synthetic-policy.${extension}`, mimeType: extension === 'txt' ? 'text/plain' : 'application/pdf', buffer };
    const chooser = page.waitForEvent('filechooser');
    await page.locator('#vault-file').click();
    await (await chooser).setFiles(file);
    await page.getByLabel('Document Title (Optional)').fill(`Synthetic ${extension} policy`);

    // Model the asynchronous session recheck when the OS picker returns focus.
    let release!: () => void;
    const pending = new Promise<void>((done) => { release = done; });
    await page.route('**/api/v1/auth/me', async (route) => { await pending; await route.continue(); });
    const recheck = page.waitForRequest('**/api/v1/auth/me');
    await page.evaluate(() => window.dispatchEvent(new Event('focus')));
    await recheck;
    const input = page.locator('#vault-file');
    await expect(input).toBeVisible();
    expect(await input.evaluate((element: HTMLInputElement) => element.files?.[0]?.name)).toBe(file.name);
    await expect(page.getByLabel('Document Title (Optional)')).toHaveValue(`Synthetic ${extension} policy`);
    const checked = page.waitForResponse('**/api/v1/auth/me');
    release(); expect((await checked).status()).toBe(200);
    await page.unroute('**/api/v1/auth/me');

    const upload = page.waitForResponse((response) => response.url().endsWith('/knowledge/documents') && response.request().method() === 'POST');
    await page.getByRole('button', { name: 'Upload guideline', exact: true }).click();
    const response = await upload;
    expect(response.status()).toBe(201);
    const result = await response.json();
    expect(result.version.extraction_status).toBe('extracted');
    expect(result.chunk_count).toBeGreaterThan(0);
    expect(result.document.status).toBe('pending');
    await expect(page.getByRole('cell', { name: `Synthetic ${extension} policy`, exact: true })).toBeVisible();
    expect(await input.evaluate((element: HTMLInputElement) => element.files?.length)).toBe(0);
    await expect(page.getByRole('button', { name: 'Upload guideline', exact: true })).toBeDisabled();
    // The same file can be selected again after a successful upload.
    await input.setInputFiles(file);
    await expect(page.getByRole('button', { name: 'Upload guideline', exact: true })).toBeEnabled();
    await page.reload();
    await expect(page.getByRole('cell', { name: `Synthetic ${extension} policy`, exact: true })).toBeVisible();
    const chunks = await page.request.get(`${api}/api/v1/knowledge/documents/${result.document.id}/chunks`);
    expect(chunks.status()).toBe(200);
    expect((await chunks.json()).chunks.map((chunk: { text: string }) => chunk.text).join(' ')).toContain(text);
  });
}
