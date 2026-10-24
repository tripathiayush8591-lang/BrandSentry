import { test, expect, type Page } from '@playwright/test';
import { spawn, type ChildProcess } from 'node:child_process';
import { mkdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const backend = resolve('../backend');
const python = process.env.BRANDSENTRY_TEST_PYTHON ?? resolve(backend, process.platform === 'win32' ? '.venv/Scripts/python.exe' : '.venv/bin/python');
const api = 'http://127.0.0.1:8002';
let server: ChildProcess;
test.beforeAll(async () => {
  server = spawn(python, ['-m', 'uvicorn', 'app.main:app', '--host', '127.0.0.1', '--port', '8002'], {
    cwd: backend, windowsHide: true, stdio: 'ignore', env: { ...process.env, APP_ENV: 'development',
      DATABASE_URL: `sqlite:///${resolve(backend, '.data/phase5c-browser.sqlite').replace(/\\/g, '/')}`,
      UPLOAD_DIR: resolve(backend, '.data/phase5c-browser-uploads'), FRONTEND_ORIGINS: 'http://127.0.0.1:5174', GUEST_SESSIONS_PER_IP_PER_HOUR: '0', GEMINI_API_KEY: '' },
  });
  await expect.poll(async () => { try { return (await fetch(`${api}/ready`)).status; } catch { return 0; } }, { timeout: 20000 }).toBe(200);
});
test.afterAll(async () => {
  if (!server || server.exitCode !== null) return;
  const exited = new Promise<void>((done) => server.once('exit', () => done())); server.kill(); await exited;
});
async function guest(page: Page) {
  await page.goto('/login'); await page.getByRole('button', { name: 'Continue as Guest', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Sign out', exact: true })).toBeVisible();
}

test('LIVE_BACKEND: empty insights, persisted counts, review outcomes, JSON snapshots and workspace isolation', async ({ page, browser }) => {
  const errors: string[] = []; page.on('pageerror', (error) => errors.push(error.message));
  await guest(page);
  await page.getByRole('link', { name: /Insights/ }).click();
  await expect(page.getByText(/No validation runs recorded/)).toBeVisible();
  const request = page.context().request;
  const csrf = (await page.context().cookies()).find((cookie) => cookie.name === 'brandsentry_session-csrf')!.value;
  const headers = { 'X-CSRF-Token': csrf, Origin: 'http://127.0.0.1:5174' };
  expect((await request.post(`${api}/api/v1/knowledge/rules`, { headers, data: { category: 'prohibited_term', name: 'Synthetic rule', rule_text: 'Avoid guarantees.', pattern: 'guarantees' } })).ok()).toBe(true);
  const uploaded = await request.post(`${api}/api/v1/knowledge/documents`, { headers, multipart: { title: 'Synthetic policy snapshot', doc_type: 'guidelines', file: { name: 'policy.txt', mimeType: 'text/plain', buffer: Buffer.from('Synthetic policy: guarantees require evidence.') } } });
  expect(uploaded.ok()).toBe(true);
  const document = (await uploaded.json()).document;
  expect((await request.post(`${api}/api/v1/knowledge/documents/${document.id}/approve`, { headers })).ok()).toBe(true);
  const sub = await (await request.post(`${api}/api/v1/submissions`, { headers, data: { title: 'Synthetic campaign', text: 'Synthetic product guarantees results.' } })).json();
  const runResponse = await request.post(`${api}/api/v1/submissions/${sub.id}/validate`, { headers, data: { content_version_id: sub.versions[0].id } });
  expect(runResponse.ok()).toBe(true); const run = await runResponse.json(); expect(run.state).toBe('partial');
  expect(run.evidence.length).toBeGreaterThan(0);
  const reviewPath = `${api}/api/v1/validation-runs/${run.id}/review`;
  for (const [index, finding] of run.findings.entries()) {
    expect((await request.post(`${reviewPath}/findings/${finding.id}`, { headers: { ...headers, 'Idempotency-Key': crypto.randomUUID() }, data: { expected_revision: index, decision: 'accept' } })).ok()).toBe(true);
  }
  expect((await request.post(`${reviewPath}/decision`, { headers: { ...headers, 'Idempotency-Key': crypto.randomUUID() }, data: { expected_revision: run.findings.length, decision: 'request_changes', notes: 'Synthetic human review.' } })).ok()).toBe(true);
  // Removing the live source must not remove the report's saved evidence.
  expect((await request.delete(`${api}/api/v1/knowledge/documents/${document.id}`, { headers })).ok()).toBe(true);
  await page.getByRole('button', { name: 'Refresh summary' }).click();
  await expect(page.getByRole('heading', { name: 'Validation runs: 1' })).toBeVisible();
  const summary = await (await request.get(`${api}/api/v1/insights/summary`)).json();
  expect(summary.run_states.partial).toBe(1); expect(summary.review_progress.changes_requested).toBe(1);
  expect(summary.findings).toEqual([{ source: 'deterministic', verification_status: 'SUPPORTED', count: run.findings.length }]);
  const evidence = resolve('evidence/phase5c'); mkdirSync(evidence, { recursive: true });
  for (const dark of [false, true]) {
    await page.getByRole('switch', { name: 'Dark mode' }).setChecked(dark);
    await page.screenshot({ path: resolve(evidence, `insights-${dark ? 'dark' : 'light'}.png`), fullPage: true });
    await page.setViewportSize({ width: 390, height: 844 });
    await expect(page.getByRole('heading', { name: 'Human review progress' })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: resolve(evidence, `insights-mobile-${dark ? 'dark' : 'light'}.png`), fullPage: true });
    await page.setViewportSize({ width: 1440, height: 960 });
  }
  await page.goto(`/runs/${run.id}`);
  await expect(page.getByRole('button', { name: 'Export validation/review JSON' })).toBeVisible();
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export validation/review JSON' }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe(`brandsentry-${run.id}.json`);
  const report = JSON.parse(readFileSync((await download.path())!, 'utf8'));
  const saved = await (await request.get(reviewPath)).json();
  expect(report.review).toEqual(saved); expect(report.review.run).toEqual(run);
  expect(report.review.run.evidence[0].text).toContain('Synthetic policy');
  expect(report.review.decisions.at(-1).notes).toBe('Synthetic human review.');
  expect(report.review.is_demo).toBe(true);
  const isolated = await browser.newContext();
  try {
    const other = await isolated.newPage(); await guest(other); await other.goto('/insights');
    await expect(other.getByText(/No validation runs recorded/)).toBeVisible();
    expect((await isolated.request.get(reviewPath)).status()).toBe(404);
  } finally { await isolated.close(); }
  await page.reload(); await expect(page.getByText('Review finalized. This run is locked.')).toBeVisible();
  expect(errors).toEqual([]);
});
