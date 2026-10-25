import { useState, useEffect, useCallback, useRef } from 'react';
import { ConnectionState } from '../types/api';
import { fetchBackendStatus, toErrorConnectionState, getApiBaseUrl } from '../services/api';

export interface UseBackendStatusReturn {
  connectionState: ConnectionState;
  checkConnection: () => Promise<void>;
  apiBaseUrl: string;
}

export function useBackendStatus(timeoutMs = 5000, enabled = true): UseBackendStatusReturn {
  const [connectionState, setConnectionState] = useState<ConnectionState>({
    status: 'loading',
  });
  const abortControllerRef = useRef<AbortController | null>(null);
  const apiBaseUrl = getApiBaseUrl();

  const checkConnection = useCallback(async () => {
    if (!enabled) return;
    // Abort any existing in-flight request
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }

    const controller = new AbortController();
    abortControllerRef.current = controller;

    setConnectionState({ status: 'loading' });

    try {
      const { data, latencyMs } = await fetchBackendStatus({
        baseUrl: apiBaseUrl,
        timeoutMs,
        signal: controller.signal,
      });

      // Avoid state updates if aborted
      if (!controller.signal.aborted) {
        setConnectionState({
          status: 'connected',
          data,
          latencyMs,
          fetchedAt: new Date(),
        });
      }
    } catch (err: unknown) {
      if (err instanceof DOMException && err.name === 'AbortError') {
        // Request was cancelled cleanly (e.g. unmount or new check initiated)
        return;
      }

      if (!controller.signal.aborted) {
        setConnectionState(toErrorConnectionState(err));
      }
    }
  }, [apiBaseUrl, timeoutMs, enabled]);

  useEffect(() => {
    // Probe on initial mount
    void checkConnection();

    return () => {
      // Abort in-flight request on unmount
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, [checkConnection]);

  return {
    connectionState,
    checkConnection,
    apiBaseUrl,
  };
}
