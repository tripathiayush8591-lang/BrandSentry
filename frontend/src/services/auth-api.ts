import { getApiBaseUrl } from './api';
import { sessionExpiryMs, type AuthSession } from '../types/auth';

export class AuthError extends Error {
  constructor(message: string, public readonly status?: number, public readonly requestId?: string) {
    super(message);
    this.name = 'AuthError';
  }
}

export function readCsrfCookie(): string {
  const value = document.cookie.split('; ').find((cookie) => cookie.startsWith('brandsentry_session-csrf='));
  try { return value ? decodeURIComponent(value.slice(value.indexOf('=') + 1)) : ''; }
  catch { return ''; }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object';
}

export function isAuthSession(value: unknown): value is AuthSession {
  if (!isRecord(value)) return false;
  const { user, workspace, session } = value;
  return isRecord(user) && isRecord(workspace) && isRecord(session)
    && typeof user.id === 'string' && user.id.length > 0
    && (user.kind === 'google' || user.kind === 'guest')
    && typeof user.display_name === 'string' && (user.email === null || typeof user.email === 'string')
    && typeof workspace.id === 'string' && typeof workspace.name === 'string'
    && (workspace.kind === 'demo' || workspace.kind === 'real')
    && session.kind === user.kind
    && workspace.kind === (user.kind === 'guest' ? 'demo' : 'real')
    && typeof session.expires_at === 'string' && Number.isFinite(sessionExpiryMs(session.expires_at))
    && ['admin', 'creator', 'reviewer'].includes(String(value.role))
    && typeof value.csrf_token === 'string';
}

async function request(path: string, options: { method?: 'GET' | 'POST'; body?: unknown; csrf?: string; signal?: AbortSignal } = {}): Promise<unknown> {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), 10000);
  const abort = () => controller.abort();
  options.signal?.addEventListener('abort', abort, { once: true });
  if (options.signal?.aborted) controller.abort();
  try {
    const response = await fetch(`${getApiBaseUrl()}${path}`, {
      method: options.method ?? 'GET', credentials: 'include', cache: 'no-store',
      headers: { Accept: 'application/json', ...(options.body ? { 'Content-Type': 'application/json' } : {}),
        ...(options.csrf ? { 'X-CSRF-Token': options.csrf } : {}) },
      body: options.body ? JSON.stringify(options.body) : undefined,
      signal: controller.signal,
    });
    if (!response.ok) {
      const id = response.headers.get('x-request-id') ?? undefined;
      // Do not display raw provider/server errors, which can contain sensitive detail.
      if (response.status === 401) throw new AuthError('Your session has ended. Please sign in again.', 401, id);
      if (response.status === 403) throw new AuthError('We couldn’t verify this request. Refresh the page and try again.', 403, id);
      if (response.status === 429) throw new AuthError('Too many sign-in attempts. Please wait a while before trying again.', 429, id);
      if ([502, 503, 504].includes(response.status)) throw new AuthError('Sign-in is temporarily unavailable. Please try again shortly or explore the read-only preview.', response.status, id);
      throw new AuthError('The server couldn’t complete your request. Please try again.', response.status, id);
    }
    if (response.status === 204) return undefined;
    return await response.json();
  } catch (error) {
    if (error instanceof AuthError) throw error;
    if (options.signal?.aborted) throw new DOMException('Aborted', 'AbortError');
    if (controller.signal.aborted) throw new AuthError('The server took too long to respond. Please try again.');
    throw new AuthError('We couldn’t reach BrandSentry. Check your connection and try again.');
  } finally {
    window.clearTimeout(timeout);
    options.signal?.removeEventListener('abort', abort);
  }
}

async function sessionRequest(path: string, options?: Parameters<typeof request>[1]): Promise<AuthSession> {
  const payload = await request(path, options);
  if (!isAuthSession(payload)) throw new AuthError('The server returned an unexpected session. Please try again.');
  return payload;
}

export const authApi = {
  me: (signal?: AbortSignal) => sessionRequest('/api/v1/auth/me', { signal }),
  google: (idToken: string) => sessionRequest('/api/v1/auth/google', { method: 'POST', body: { id_token: idToken }, csrf: readCsrfCookie() }),
  guest: () => sessionRequest('/api/v1/auth/guest', { method: 'POST', csrf: readCsrfCookie() }),
  logout: async (csrf: string) => {
    if (!csrf) throw new AuthError('Session protection could not be restored. Reopen BrandSentry using the same address you signed in with, then try again.');
    await request('/api/v1/auth/logout', { method: 'POST', csrf });
  },
};
