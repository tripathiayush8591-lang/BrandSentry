import { renderHook, act, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { useBackendStatus } from '../src/hooks/useBackendStatus';
import { StatusResponse } from '../src/types/api';

describe('useBackendStatus Hook', () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  const validResponse: StatusResponse = {
    status: 'ok',
    service: 'brandsentry-backend',
    version: '0.1.0',
    environment: 'development',
    api_version: 'v1',
    time_utc: '2026-10-23T15:00:00Z',
    request_id: 'req_hook_123',
  };

  it('probes backend status on mount and transitions to connected', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: { get: () => 'req_hook_123' },
      json: async () => validResponse,
    } as unknown as Response);

    const { result } = renderHook(() => useBackendStatus(2000));

    // Initially loading
    expect(result.current.connectionState.status).toBe('loading');

    // Transitions to connected
    await waitFor(() => {
      expect(result.current.connectionState.status).toBe('connected');
    });

    if (result.current.connectionState.status === 'connected') {
      expect(result.current.connectionState.data.service).toBe('brandsentry-backend');
      expect(result.current.connectionState.data.request_id).toBe('req_hook_123');
    }
  });

  it('allows manual re-check via checkConnection', async () => {
    let callCount = 0;
    global.fetch = vi.fn().mockImplementation(() => {
      callCount++;
      return Promise.resolve({
        ok: true,
        status: 200,
        headers: { get: () => `req_call_${callCount}` },
        json: async () => ({ ...validResponse, request_id: `req_call_${callCount}` }),
      } as unknown as Response);
    });

    const { result } = renderHook(() => useBackendStatus(2000));

    await waitFor(() => {
      expect(result.current.connectionState.status).toBe('connected');
    });

    // Trigger checkConnection manually
    await act(async () => {
      await result.current.checkConnection();
    });

    await waitFor(() => {
      if (result.current.connectionState.status === 'connected') {
        expect(result.current.connectionState.data.request_id).toBe('req_call_2');
      }
    });

    expect(callCount).toBe(2);
  });

  it('aborts in-flight request on unmount without throwing unhandled rejection', () => {
    let abortListenerAdded = false;
    global.fetch = vi.fn().mockImplementation((_url, { signal }) => {
      return new Promise((_, reject) => {
        signal.addEventListener('abort', () => {
          abortListenerAdded = true;
          reject(new DOMException('The operation was aborted.', 'AbortError'));
        });
      });
    });

    const { unmount } = renderHook(() => useBackendStatus(2000));
    unmount();

    expect(abortListenerAdded).toBe(true);
  });
});
