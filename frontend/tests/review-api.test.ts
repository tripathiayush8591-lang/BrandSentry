import { afterEach, describe, expect, it, vi } from 'vitest';
import { brandApi, BrandApiError } from '../src/services/brand-api';
import { reviewFixture, decisionFixture } from './review-fixtures';

afterEach(() => { vi.unstubAllGlobals(); document.cookie = 'brandsentry_session-csrf=; Max-Age=0; path=/'; });
describe('review API contract', () => {
  it('reads the full original review through the credentialed client without caching', async () => {
    const fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify(reviewFixture()))); vi.stubGlobal('fetch', fetch);
    expect(await brandApi.getReview('run/1')).toEqual(reviewFixture());
    expect(fetch).toHaveBeenCalledWith(expect.stringContaining('/run%2F1/review'), expect.objectContaining({ credentials: 'include', cache: 'no-store' }));
  });
  it('sends only exact schema fields with session-memory CSRF and the caller replay key', async () => {
    const fetch = vi.fn().mockImplementation(async () => new Response(JSON.stringify(decisionFixture()))); vi.stubGlobal('fetch', fetch);
    const body = { expected_revision: 3, decision: 'reject' as const, notes: 'Human reason' };
    await brandApi.reviewFinding('run/1', 'finding/1', body, 'stable-key', 'memory-csrf');
    await brandApi.reviewFinding('run/1', 'finding/1', body, 'stable-key', 'memory-csrf');
    expect(fetch.mock.calls[0]).toEqual(fetch.mock.calls[1].map((value, i) => i ? expect.objectContaining({ ...value, signal: expect.any(AbortSignal) }) : value));
    const [url, options] = fetch.mock.calls[0];
    expect(url).toContain('/run%2F1/review/findings/finding%2F1');
    expect(JSON.parse(options.body)).toEqual(body);
    expect(options).toMatchObject({ method: 'POST', credentials: 'include', cache: 'no-store', headers: { 'X-CSRF-Token': 'memory-csrf', 'Idempotency-Key': 'stable-key' } });
  });
  it('restores CSRF from the existing companion cookie for final decisions', async () => {
    document.cookie = 'brandsentry_session-csrf=cookie-csrf; path=/';
    const fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify(decisionFixture()))); vi.stubGlobal('fetch', fetch);
    await brandApi.finalizeReview('run-1', { expected_revision: 0, decision: 'request_changes', notes: null }, 'final-key');
    expect(fetch).toHaveBeenCalledWith(expect.stringContaining('/review/decision'), expect.objectContaining({ headers: expect.objectContaining({ 'X-CSRF-Token': 'cookie-csrf' }) }));
  });
  it('fails closed without CSRF and preserves conflict status for reconciliation', async () => {
    const fetch = vi.fn(); vi.stubGlobal('fetch', fetch);
    await expect(brandApi.finalizeReview('run-1', { expected_revision: 0, decision: 'approve' }, 'key')).rejects.toMatchObject({ status: 403 });
    expect(fetch).not.toHaveBeenCalled();
    fetch.mockImplementation(async () => new Response(JSON.stringify({ error: { code: 'CONFLICT', message: 'Stale revision' } }), { status: 409 }));
    await expect(brandApi.finalizeReview('run-1', { expected_revision: 0, decision: 'approve' }, 'key', 'csrf')).rejects.toBeInstanceOf(BrandApiError);
    await expect(brandApi.finalizeReview('run-1', { expected_revision: 0, decision: 'approve' }, 'key', 'csrf')).rejects.toMatchObject({ status: 409, code: 'CONFLICT' });
  });
});
