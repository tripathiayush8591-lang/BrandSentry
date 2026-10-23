import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  fetchBackendStatus,
  ApiClientError,
  getApiBaseUrl,
  toErrorConnectionState,
} from '../src/services/api';
import { StatusResponse } from '../src/types/api';

describe('API Client — fetchBackendStatus', () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  const validStatusPayload: StatusResponse = {
    status: 'ok',
    service: 'brandsentry-backend',
    version: '0.1.0',
    environment: 'development',
    api_version: 'v1',
    time_utc: '2026-10-23T15:30:00.000000Z',
    request_id: 'req_test123456',
  };

  it('resolves the API base URL from default or env', () => {
    const url = getApiBaseUrl();
    expect(url).toMatch(/^http:\/\/(127\.0\.0\.1|localhost):8000/);
  });

  it('handles successful API connection and parses response contract', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: {
        get: (h: string) => (h.toLowerCase() === 'x-request-id' ? 'req_test123456' : null),
      },
      json: async () => validStatusPayload,
    } as unknown as Response);

    const result = await fetchBackendStatus({ baseUrl: 'http://127.0.0.1:8000' });

    expect(global.fetch).toHaveBeenCalledWith(
      'http://127.0.0.1:8000/api/v1/status',
      expect.objectContaining({
        method: 'GET',
        headers: { Accept: 'application/json' },
      })
    );
    expect(result.data.status).toBe('ok');
    expect(result.data.service).toBe('brandsentry-backend');
    expect(result.data.version).toBe('0.1.0');
    expect(result.data.api_version).toBe('v1');
    expect(result.data.request_id).toBe('req_test123456');
    expect(result.latencyMs).toBeGreaterThanOrEqual(0);
  });

  it('handles backend unavailable / network errors', async () => {
    global.fetch = vi.fn().mockRejectedValue(new TypeError('Failed to fetch'));

    await expect(
      fetchBackendStatus({ baseUrl: 'http://127.0.0.1:8000' })
    ).rejects.toThrow(ApiClientError);

    try {
      await fetchBackendStatus({ baseUrl: 'http://127.0.0.1:8000' });
    } catch (err) {
      const apiErr = err as ApiClientError;
      expect(apiErr.errorType).toBe('unreachable');
      expect(apiErr.message).toContain('Unable to connect to backend');
    }
  });

  it('handles request timeout when the server takes too long to respond', async () => {
    global.fetch = vi.fn().mockImplementation((_url, { signal }) => {
      return new Promise((_, reject) => {
        signal.addEventListener('abort', () => {
          const abortErr = new DOMException('The operation was aborted.', 'AbortError');
          reject(abortErr);
        });
      });
    });

    await expect(
      fetchBackendStatus({ baseUrl: 'http://127.0.0.1:8000', timeoutMs: 30 })
    ).rejects.toThrow(ApiClientError);

    try {
      await fetchBackendStatus({ baseUrl: 'http://127.0.0.1:8000', timeoutMs: 30 });
    } catch (err) {
      const apiErr = err as ApiClientError;
      expect(apiErr.errorType).toBe('timeout');
      expect(apiErr.message).toContain('timed out after 30ms');
    }
  });

  it('handles malformed API response missing required fields', async () => {
    const invalidPayload = {
      status: 'ok',
      // missing service, version, environment, api_version, etc.
    };

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: { get: () => null },
      json: async () => invalidPayload,
    } as unknown as Response);

    try {
      await fetchBackendStatus({ baseUrl: 'http://127.0.0.1:8000' });
      expect.fail('Should have thrown ApiClientError');
    } catch (err) {
      const apiErr = err as ApiClientError;
      expect(apiErr.errorType).toBe('malformed');
      expect(apiErr.message).toContain('missing required fields');
    }
  });

  it('handles malformed non-JSON responses', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: { get: () => null },
      json: async () => {
        throw new SyntaxError('Unexpected token < in JSON');
      },
    } as unknown as Response);

    try {
      await fetchBackendStatus({ baseUrl: 'http://127.0.0.1:8000' });
      expect.fail('Should have thrown ApiClientError');
    } catch (err) {
      const apiErr = err as ApiClientError;
      expect(apiErr.errorType).toBe('malformed');
      expect(apiErr.message).toContain('non-JSON');
    }
  });

  it('handles HTTP 503 / 500 server error responses with backend error contract', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 503,
      statusText: 'Service Unavailable',
      headers: {
        get: (h: string) => (h.toLowerCase() === 'x-request-id' ? 'req_err_999' : null),
      },
      json: async () => ({
        error: {
          code: 'SERVICE_UNAVAILABLE',
          message: 'Persistent storage not ready',
          request_id: 'req_err_999',
        },
      }),
    } as unknown as Response);

    try {
      await fetchBackendStatus({ baseUrl: 'http://127.0.0.1:8000' });
      expect.fail('Should have thrown ApiClientError');
    } catch (err) {
      const apiErr = err as ApiClientError;
      expect(apiErr.errorType).toBe('server_error');
      expect(apiErr.statusCode).toBe(503);
      expect(apiErr.message).toBe('Persistent storage not ready');
      expect(apiErr.requestId).toBe('req_err_999');
    }
  });

  it('correctly maps errors via toErrorConnectionState helper', () => {
    const clientErr = new ApiClientError('Server timeout', 'timeout');
    const state = toErrorConnectionState(clientErr);
    expect(state.status).toBe('error');
    if (state.status === 'error') {
      expect(state.errorType).toBe('timeout');
      expect(state.message).toBe('Server timeout');
    }
  });
});
