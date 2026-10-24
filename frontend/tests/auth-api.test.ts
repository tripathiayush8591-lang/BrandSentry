import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { authApi, AuthError, isAuthSession, readCsrfCookie } from '../src/services/auth-api';
import { demoSession } from './auth-fixtures';
import { getApiBaseUrl } from '../src/services/api';
import { sessionExpiryMs } from '../src/types/auth';

const fetchMock = vi.fn();
beforeEach(() => { vi.stubGlobal('fetch', fetchMock); fetchMock.mockReset(); vi.stubEnv('VITE_API_BASE_URL', 'http://127.0.0.1:8001'); });
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); document.cookie = 'brandsentry_session-csrf=; max-age=0; path=/'; vi.useRealTimers(); });
function response(status = 200, body: unknown = demoSession()) { return new Response(status === 204 ? null : JSON.stringify(body), { status }); }

describe('Cookie session API contract', () => {
  it.each([undefined, '', 'http://127.0.0.1:8000', 'https://example.test'])('uses the same-origin production proxy regardless of API env %s', async (base) => {
    vi.stubEnv('PROD', true);
    vi.stubEnv('VITE_API_BASE_URL', base);
    expect(getApiBaseUrl()).toBe('');
    fetchMock.mockResolvedValue(response());
    await authApi.me();
    expect(fetchMock).toHaveBeenCalledWith('/api/v1/auth/me', expect.objectContaining({ credentials: 'include', cache: 'no-store' }));
  });
  it('interprets timezone-less Phase 2A SQLite timestamps as UTC', () => {
    expect(sessionExpiryMs('2026-10-24T04:00:00.000000')).toBe(Date.parse('2026-10-24T04:00:00Z'));
    expect(sessionExpiryMs('2026-10-24T09:30:00+05:30')).toBe(Date.parse('2026-10-24T04:00:00Z'));
  });
  it('creates a guest using the real route, credentials and no invented token/body', async () => {
    fetchMock.mockResolvedValue(response(201)); await authApi.guest();
    expect(fetchMock).toHaveBeenCalledWith('http://127.0.0.1:8001/api/v1/auth/guest', expect.objectContaining({ method: 'POST', credentials: 'include', body: undefined, cache: 'no-store' }));
  });
  it('passes only the Firebase ID token to the Google exchange', async () => {
    fetchMock.mockResolvedValue(response(200, demoSession('google'))); await authApi.google('mock-token');
    expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining('/auth/google'), expect.objectContaining({ body: JSON.stringify({ id_token: 'mock-token' }), credentials: 'include' }));
  });
  it('restores with a credentialed uncached GET', async () => {
    fetchMock.mockResolvedValue(response()); await authApi.me();
    expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining('/auth/me'), expect.objectContaining({ method: 'GET', credentials: 'include', cache: 'no-store' }));
  });
  it('reads the companion cookie and sends CSRF on logout', async () => {
    document.cookie = 'brandsentry_session-csrf=mock-cookie-csrf; path=/';
    expect(readCsrfCookie()).toBe('mock-cookie-csrf');
    fetchMock.mockResolvedValue(response(204)); await authApi.logout(readCsrfCookie());
    expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining('/auth/logout'), expect.objectContaining({ method: 'POST', credentials: 'include', headers: expect.objectContaining({ 'X-CSRF-Token': 'mock-cookie-csrf' }) }));
  });
  it('refuses logout when session-bound CSRF cannot be recovered', async () => {
    await expect(authApi.logout('')).rejects.toThrow('Session protection');
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it('supports relative and absolute configurable API bases', async () => {
    vi.stubEnv('VITE_API_BASE_URL', ''); expect(getApiBaseUrl()).toBe('');
    fetchMock.mockResolvedValue(response()); await authApi.me();
    expect(fetchMock.mock.calls[0][0]).toBe('/api/v1/auth/me');
    vi.stubEnv('VITE_API_BASE_URL', 'https://example.test/proxy/'); expect(getApiBaseUrl()).toBe('https://example.test/proxy');
  });
  it.each([401, 403, 429, 500, 502, 503, 504])('handles HTTP %s without disclosing raw errors', async (status) => {
    fetchMock.mockResolvedValue(response(status, { error: { message: 'RAW PRIVATE ERROR' } }));
    try { await authApi.me(); throw new Error('Expected rejection'); }
    catch (error) { expect(error).toBeInstanceOf(AuthError); expect((error as AuthError).status).toBe(status); expect((error as Error).message).not.toContain('RAW'); }
  });
  it('handles network failures', async () => {
    fetchMock.mockRejectedValue(new TypeError('failed')); await expect(authApi.me()).rejects.toThrow('Check your connection');
  });
  it('aborts slow requests with a useful timeout message', async () => {
    vi.useFakeTimers();
    fetchMock.mockImplementation((_url, options: RequestInit) => new Promise((_resolve, reject) => options.signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')))));
    const check = expect(authApi.me()).rejects.toThrow('too long');
    await vi.advanceTimersByTimeAsync(10000); await check;
  });
  it('rejects malformed identity, dates and inconsistent workspace kinds', async () => {
    expect(isAuthSession({ ...demoSession(), role: 'owner' })).toBe(false);
    expect(isAuthSession({ ...demoSession(), session: { kind: 'guest', expires_at: 'invalid' } })).toBe(false);
    expect(isAuthSession({ ...demoSession(), workspace: { id: 'x', name: 'x', kind: 'real' } })).toBe(false);
    fetchMock.mockResolvedValue(response(200, {})); await expect(authApi.me()).rejects.toThrow('unexpected session');
  });
});
