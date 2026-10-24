import { test, expect } from '@playwright/test';
import { spawn, type ChildProcess } from 'node:child_process';
import { mkdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const backend = resolve('../backend');
const python = process.env.BRANDSENTRY_TEST_PYTHON ?? resolve(backend, process.platform === 'win32' ? '.venv/Scripts/python.exe' : '.venv/bin/python');
const api = 'http://127.0.0.1:8002';
let server: ChildProcess;

async function start() {
  server = spawn(python, [resolve('../docs/qa/phase5d_mock_server.py')], {
    cwd: backend, windowsHide: true, stdio: 'ignore', env: { ...process.env, GEMINI_API_KEY: '' },
  });
  await expect.poll(async () => { try { return (await fetch(`${api}/ready`)).status; } catch { return 0; } }, { timeout: 20000 }).toBe(200);
}
async function stop() {
  if (!server || server.exitCode !== null) return;
  const exited = new Promise<void>((done) => server.once('exit', () => done()));
  server.kill(); await exited;
}
test.beforeAll(start);
test.afterAll(stop);

test('LIVE_BACKEND + MOCK Gemini: complete judge journey, export and process restart', async ({ page }) => {
  test.setTimeout(120000);
  const errors: string[] = []; page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/login');
  await page.getByRole('button', { name: 'Continue as Guest', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Sign out', exact: true })).toBeVisible();
  const request = page.context().request;
  const me = await (await request.get(`${api}/api/v1/auth/me`)).json();
  const csrf = (await page.context().cookies()).find((cookie) => cookie.name === 'brandsentry_session-csrf')!.value;
  const headers = { 'X-CSRF-Token': csrf, Origin: 'http://127.0.0.1:5174' };

  await page.goto('/vault');
  await page.getByLabel('File (PDF or UTF-8 TXT, max 5MB)').setInputFiles({
    name: 'synthetic-policy.txt', mimeType: 'text/plain',
    buffer: Buffer.from('Synthetic EcoBlend policy. Never promise guarantees. EcoBlend uses recycled packaging; outcomes vary.'),
  });
  await page.getByLabel('Document Title (Optional)').fill('Synthetic EcoBlend QA policy');
  await page.getByRole('button', { name: 'Upload guideline' }).click();
  await page.getByRole('button', { name: 'Approve', exact: true }).click();
  await expect(page.getByRole('cell', { name: 'Approved', exact: true })).toBeVisible();
  const documents = await (await request.get(`${api}/api/v1/knowledge/documents`)).json();
  const docId = documents.documents[0].id;
  const claim = await request.post(`${api}/api/v1/knowledge/claims`, { headers, data: {
    claim_text: 'Synthetic EcoBlend uses recycled packaging.', source_document_id: docId,
  } });
  expect(claim.status()).toBe(201);
  const rule = await request.post(`${api}/api/v1/knowledge/rules`, { headers, data: {
    category: 'prohibited_term', name: 'Synthetic guarantee rule', rule_text: 'Never promise guarantees.',
    pattern: 'guarantees', source_document_id: docId, replacement: 'may support',
  } });
  expect(rule.status()).toBe(201);

  await page.goto('/studio');
  await page.getByLabel('Campaign / Asset Title').fill('Synthetic Phase 5D campaign');
  await page.getByLabel('Marketing Copy / Proposed Content').fill('Synthetic EcoBlend guarantees 100% results!');
  await page.getByRole('button', { name: 'Check content', exact: true }).last().click();
  await expect(page.getByRole('heading', { name: 'Evidence & Findings', exact: true })).toBeVisible();
  const runId = new URL(page.url()).pathname.split('/').at(-1)!;
  const reviewPath = `${api}/api/v1/validation-runs/${runId}/review`;
  const original = await (await request.get(`${api}/api/v1/validation-runs/${runId}`)).json();
  expect(original.state).toBe('completed'); expect(original.ai_status).toBe('complete');
  expect(original.findings.some((f: { source: string; verification_status: string }) => f.source === 'ai' && f.verification_status === 'NEEDS_VERIFICATION')).toBe(true);
  expect(original.findings.some((f: { source: string }) => f.source === 'deterministic')).toBe(true);
  expect(original.evidence[0].document_id).toBe(docId);
  expect(original.findings.find((f: { source: string }) => f.source === 'ai').evidence_chunk_ids).toContain(original.evidence[0].chunk_id);
  await expect(page.getByText('Synthetic EcoBlend QA policy', { exact: true }).first()).toBeVisible();

  for (let i = 1; i <= original.findings.length; i++) {
    const region = page.getByRole('region', { name: `Human judgment for finding ${i}`, exact: true });
    await region.getByLabel(/Reviewer notes/).fill('Synthetic QA exception only; not a real publication approval.');
    await region.getByRole('button', { name: 'Reject finding' }).click();
    await expect(region.getByText('Reject — dismissed', { exact: true })).toBeVisible();
  }
  await page.getByRole('button', { name: 'Approve', exact: true }).click();
  await page.getByRole('button', { name: 'Confirm final decision' }).click();
  await expect(page.getByText('Review finalized. This run is locked.')).toBeVisible();
  const saved = await (await request.get(reviewPath)).json();
  expect(saved.status).toBe('approved'); expect(saved.is_demo).toBe(true);
  expect(saved.run).toEqual(original);
  await page.goto('/insights');
  const summary = await (await request.get(`${api}/api/v1/insights/summary`)).json();
  expect(summary.review_progress.approved).toBe(1);
  const captures = resolve('../backend/.data/phase5d/captures'); mkdirSync(captures, { recursive: true });
  for (const dark of [false, true]) {
    await page.getByRole('switch', { name: 'Dark mode' }).setChecked(dark);
    for (const width of [1440, 390]) {
      await page.setViewportSize({ width, height: 960 });
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      await page.screenshot({ path: resolve(captures, `judge-insights-${width}-${dark ? 'dark' : 'light'}.png`), fullPage: true });
    }
  }
  await page.goto(`/runs/${runId}`);
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export validation/review JSON' }).click();
  const download = await downloadPromise;
  const exported = JSON.parse(readFileSync((await download.path())!, 'utf8'));
  expect(exported.review).toEqual(saved);
  await stop(); await start();
  await page.reload();
  await expect(page.getByText('Review finalized. This run is locked.')).toBeVisible();
  expect(await (await request.get(reviewPath)).json()).toEqual(saved);
  expect((await (await request.get(`${api}/api/v1/auth/me`)).json()).workspace.id).toBe(me.workspace.id);
  expect(await (await request.get(`${api}/api/v1/insights/summary`)).json()).toEqual(summary);
  expect(errors).toEqual([]);
});
