import { test, expect, type Page } from '@playwright/test';
import { spawn, type ChildProcess } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { reviewFixture, submissionFixture, decisionFixture } from '../tests/review-fixtures';

const backend = resolve('../backend');
const python = process.env.BRANDSENTRY_TEST_PYTHON ?? resolve(backend, process.platform === 'win32' ? '.venv/Scripts/python.exe' : '.venv/bin/python');
const api = 'http://127.0.0.1:8002';
const evidence = resolve('evidence/phase5b');
let server: ChildProcess;
test.beforeAll(async () => {
  mkdirSync(evidence, { recursive: true });
  server = spawn(python, ['-m', 'uvicorn', 'app.main:app', '--host', '127.0.0.1', '--port', '8002'], {
    cwd: backend, windowsHide: true, stdio: 'ignore', env: { ...process.env, APP_ENV: 'development',
      DATABASE_URL: `sqlite:///${resolve(backend, '.data/phase5b-browser.sqlite').replace(/\\/g, '/')}`,
      UPLOAD_DIR: resolve(backend, '.data/phase5b-browser-uploads'), FRONTEND_ORIGINS: 'http://127.0.0.1:5174', GUEST_SESSIONS_PER_IP_PER_HOUR: '0', GEMINI_API_KEY: '' },
  });
  await expect.poll(async () => { try { return (await fetch(`${api}/ready`)).status; } catch { return 0; } }, { timeout: 20000 }).toBe(200);
});
test.afterAll(async () => {
  if (!server || server.exitCode !== null) return;
  const exited = new Promise<void>((done) => server.once('exit', () => done())); server.kill(); await exited;
});
async function guest(page: Page) {
  await page.goto('/login');
  await page.getByRole('button', { name: 'Continue as Guest', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Sign out', exact: true })).toBeVisible();
}
async function createRun(page: Page) {
  await guest(page);
  const request = page.context().request;
  const csrf = (await page.context().cookies()).find((cookie) => cookie.name === 'brandsentry_session-csrf')?.value;
  expect(csrf).toBeTruthy();
  const headers = { 'X-CSRF-Token': csrf!, Origin: 'http://127.0.0.1:5174' };
  const rule = await request.post(`${api}/api/v1/knowledge/rules`, { headers, data: { category: 'prohibited_term', name: 'Synthetic guarantee rule', rule_text: 'Avoid unsupported guarantees.', pattern: 'guarantees', replacement: 'may support' } });
  expect(rule.ok()).toBe(true);
  const submission = await (await request.post(`${api}/api/v1/submissions`, { headers, data: { title: 'Synthetic EcoBlend campaign', text: 'Synthetic EcoBlend guarantees results.' } })).json();
  const runResponse = await request.post(`${api}/api/v1/submissions/${submission.id}/validate`, { headers: { ...headers, 'Idempotency-Key': crypto.randomUUID() }, data: { content_version_id: submission.versions[0].id } });
  expect(runResponse.ok()).toBe(true);
  const run = await runResponse.json(); expect(run.findings.length).toBeGreaterThan(0);
  return { run, headers, submission };
}

test('LIVE_BACKEND: review dispositions, CSRF, confirmation, history and immutable original output', async ({ page }) => {
  const errors: string[] = []; page.on('pageerror', (e) => errors.push(e.message));
  const { run, headers } = await createRun(page);
  const path = `${api}/api/v1/validation-runs/${run.id}/review`;
  expect((await page.context().request.post(`${path}/findings/${run.findings[0].id}`, { headers: { 'Idempotency-Key': crypto.randomUUID() }, data: { expected_revision: 0, decision: 'accept' } })).status()).toBe(403);
  await page.goto(`/runs/${run.id}`);
  await expect(page.getByText('Pending human review', { exact: true }).first()).toBeVisible();
  await page.getByRole('switch', { name: 'Dark mode' }).uncheck();
  await page.screenshot({ path: resolve(evidence, 'review-pending-light.png'), fullPage: true });
  const finding = page.getByRole('region', { name: 'Human judgment for finding 1', exact: true });
  await finding.getByRole('button', { name: 'Flag for investigation' }).click();
  await expect(finding.getByText('Flag — investigate · Unresolved')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Request changes', exact: true })).toBeDisabled();
  await finding.getByRole('button', { name: 'Accept issue' }).click();
  await expect(finding.getByText('Accept — issue exists', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Approve', exact: true })).toBeDisabled();
  await finding.getByLabel(/Reviewer notes/).fill('Synthetic reviewer investigated; documented exception.');
  await finding.getByRole('button', { name: 'Reject finding' }).click();
  await expect(finding.getByText('Reject — dismissed', { exact: true })).toBeVisible();
  const requestChanges = page.getByRole('button', { name: 'Request changes', exact: true });
  await expect(requestChanges).toBeEnabled();
  await page.getByRole('switch', { name: 'Dark mode' }).check();
  await page.screenshot({ path: resolve(evidence, 'review-in-progress-dark.png'), fullPage: true });
  await page.getByLabel('Final reviewer notes (optional)').fill('Synthetic final: update content before publication.');
  await requestChanges.click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).not.toBeVisible();
  await expect(requestChanges).toBeFocused();
  await requestChanges.click();
  await page.getByRole('button', { name: 'Confirm final decision' }).click();
  await expect(page.getByText('Review finalized. This run is locked.')).toBeVisible();
  await expect(page.getByText('Revision 4 · Request changes')).toBeVisible();
  await page.reload();
  await expect(page.getByText('Revision 1 · Flag — investigate')).toBeVisible();
  const original = await (await page.context().request.get(`${api}/api/v1/validation-runs/${run.id}`)).json();
  expect(original).toEqual(run);
  const saved = await (await page.context().request.get(path)).json();
  expect(saved.decisions).toHaveLength(4); expect(saved.status).toBe('changes_requested');
  expect(saved.decisions[2].notes).toContain('documented exception');
  expect(saved.decisions.every((d: { is_demo: boolean }) => d.is_demo)).toBe(true);
  await page.screenshot({ path: resolve(evidence, 'review-finalized-dark.png'), fullPage: true });
  await page.getByRole('switch', { name: 'Dark mode' }).uncheck();
  await page.screenshot({ path: resolve(evidence, 'review-finalized-light.png'), fullPage: true });
  const stale = await page.context().request.post(`${path}/decision`, { headers: { ...headers, 'Idempotency-Key': crypto.randomUUID() }, data: { expected_revision: 0, decision: 'request_changes' } });
  expect(stale.status()).toBe(409);
  expect(errors).toEqual([]);
});

test('LIVE_BACKEND: concurrent conflict reload and exact retry after a lost successful response', async ({ page }) => {
  const { run, headers } = await createRun(page);
  const path = `${api}/api/v1/validation-runs/${run.id}/review`;
  await page.goto(`/runs/${run.id}`);
  await expect(page.getByRole('button', { name: 'Accept issue' })).toBeEnabled();
  expect((await page.context().request.post(`${path}/findings/${run.findings[0].id}`, { headers: { ...headers, 'Idempotency-Key': crypto.randomUUID() }, data: { expected_revision: 0, decision: 'flag', notes: 'Synthetic concurrent reviewer event' } })).ok()).toBe(true);
  await page.getByRole('button', { name: 'Accept issue' }).click();
  await expect(page.getByRole('alert')).toContainText('Review conflict');
  await expect(page.getByText('Revision 1 · Flag — investigate')).toBeVisible();
  let intercepted = false;
  const bodies: unknown[] = []; const keys: string[] = [];
  await page.route(`**/review/findings/${run.findings[0].id}`, async (route) => {
    bodies.push(route.request().postDataJSON()); keys.push(route.request().headers()['idempotency-key']);
    if (!intercepted) { intercepted = true; const result = await route.fetch(); expect(result.ok()).toBe(true); await route.abort('failed'); }
    else await route.continue();
  });
  await page.getByRole('button', { name: 'Accept issue' }).click();
  await page.getByRole('button', { name: 'Retry exact decision' }).click();
  await expect(page.getByText('Revision 2 · Accept — issue exists')).toBeVisible();
  const saved = await (await page.context().request.get(path)).json(); expect(saved.revision).toBe(2);
  expect(keys).toHaveLength(2); expect(keys[0]).toBe(keys[1]); expect(bodies[0]).toEqual(bodies[1]);
});

test('MOCK review response: mobile themes, snapshots, history, and approval confirmation', async ({ page }) => {
  await guest(page);
  const review = reviewFixture();
  await page.route('**/api/v1/submissions/submission-1', (route) => route.fulfill({ json: submissionFixture() }));
  await page.route('**/api/v1/validation-runs/run-1/review', (route) => route.fulfill({ json: review }));
  await page.route('**/review/findings/finding-1', async (route) => {
    const body = route.request().postDataJSON();
    expect(route.request().headers()['x-csrf-token']).toBeTruthy();
    review.revision++; review.status = 'in_review'; review.unresolved_finding_ids = []; review.approval_blockers = [];
    const event = { ...decisionFixture('reject'), notes: body.notes }; review.decisions.push(event); await route.fulfill({ json: event });
  });
  await page.route('**/review/decision', async (route) => {
    expect(route.request().postDataJSON().decision).toBe('approve');
    review.revision++; review.status = 'approved'; review.approval_blockers = ['review_final'];
    const event = { ...decisionFixture('approve', 2), finding_id: null }; review.decisions.push(event); await route.fulfill({ json: event });
  });
  await page.goto('/runs/run-1');
  await expect(page.getByText('Original AI assessment · Finding 1')).toBeVisible();
  for (const dark of [false, true]) {
    await page.getByRole('switch', { name: 'Dark mode' }).setChecked(dark);
    for (const width of [320, 390, 820]) {
      await page.setViewportSize({ width, height: 900 });
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      if (width === 390) await page.screenshot({ path: resolve(evidence, `review-mobile-${dark ? 'dark' : 'light'}-MOCK.png`), fullPage: true });
    }
  }
  await page.getByLabel(/Reviewer notes/).fill('Synthetic explicit human dismissal.');
  await page.getByRole('button', { name: 'Reject finding' }).click();
  await expect(page.getByRole('button', { name: 'Approve', exact: true })).toBeEnabled();
  await page.getByRole('button', { name: 'Approve', exact: true }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.screenshot({ path: resolve(evidence, 'review-confirmation-MOCK.png') });
  await page.getByRole('button', { name: 'Confirm final decision' }).click();
  await expect(page.getByText('Review finalized. This run is locked.')).toBeVisible();
  await expect(page.getByText('NEEDS_VERIFICATION', { exact: true })).toBeVisible();
});

test('MOCK permission states: creator, original author, historical approval and empty findings', async ({ page }) => {
  await guest(page);
  const me = await (await page.context().request.get(`${api}/api/v1/auth/me`)).json();
  const review = reviewFixture(); const submission = submissionFixture();
  await page.route('**/api/v1/auth/me', (route) => route.fulfill({ json: me }));
  await page.route('**/api/v1/submissions/submission-1', (route) => route.fulfill({ json: submission }));
  await page.route('**/api/v1/validation-runs/run-1/review', (route) => route.fulfill({ json: review }));
  me.role = 'creator'; await page.goto('/runs/run-1');
  await expect(page.getByText(/Your workspace role does not permit review/)).toBeVisible();
  await expect(page.getByRole('button', { name: 'Accept issue' })).toBeDisabled();
  me.role = 'admin'; me.user.kind = 'google'; me.session.kind = 'google'; me.workspace.kind = 'real'; review.is_demo = false; submission.created_by = me.user.id;
  await page.reload();
  await expect(page.getByText(/Original authors cannot review/)).toBeVisible();
  submission.created_by = 'another-author'; review.status = 'approved'; review.is_current = false; review.approval_blockers = ['stale_run', 'review_final'];
  await page.reload(); await expect(page.getByText('Historical · Approved')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Approve', exact: true })).toBeDisabled();
  review.status = 'pending'; review.is_current = true; review.run.findings = []; review.unresolved_finding_ids = []; review.approval_blockers = [];
  await page.reload(); await expect(page.getByText('No policy violations detected')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Approve', exact: true })).toBeEnabled();
});
