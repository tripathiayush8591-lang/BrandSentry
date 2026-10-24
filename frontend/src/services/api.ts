import { StatusResponse, ConnectionState, ApiErrorResponse } from '../types/api';

/**
 * Resolves the API base URL from Vite environment variables.
 * Production always uses the cookie-preserving same-origin Vercel proxy.
 * Local development can target a configurable backend.
 */
export function getApiBaseUrl(): string {
  if (import.meta.env.PROD) return '';
  const envUrl = import.meta.env.VITE_API_BASE_URL;
  if (typeof envUrl === 'string') {
    return envUrl.trim().replace(/\/+$/, '');
  }
  return 'http://127.0.0.1:8000';
}

export interface FetchStatusOptions {
  baseUrl?: string;
  timeoutMs?: number;
  signal?: AbortSignal;
}

export class ApiClientError extends Error {
  public readonly errorType: 'unreachable' | 'timeout' | 'malformed' | 'server_error';
  public readonly statusCode?: number;
  public readonly requestId?: string;

  constructor(
    message: string,
    errorType: 'unreachable' | 'timeout' | 'malformed' | 'server_error',
    statusCode?: number,
    requestId?: string
  ) {
    super(message);
    this.name = 'ApiClientError';
    this.errorType = errorType;
    this.statusCode = statusCode;
    this.requestId = requestId;
  }
}

/**
 * Validates the runtime shape of StatusResponse to guard against malformed API payloads.
 */
function isStatusResponse(data: unknown): data is StatusResponse {
  if (!data || typeof data !== 'object') return false;
  const d = data as Record<string, unknown>;
  return (
    d.status === 'ok' &&
    typeof d.service === 'string' &&
    typeof d.version === 'string' &&
    typeof d.environment === 'string' &&
    d.api_version === 'v1' &&
    typeof d.time_utc === 'string' &&
    typeof d.request_id === 'string'
  );
}

/**
 * Fetches backend status from GET /api/v1/status with timeout and abort handling.
 */
export async function fetchBackendStatus(
  options: FetchStatusOptions = {}
): Promise<{ data: StatusResponse; latencyMs: number; requestId?: string }> {
  const baseUrl = options.baseUrl ?? getApiBaseUrl();
  const timeoutMs = options.timeoutMs ?? 5000;
  const endpoint = `${baseUrl}/api/v1/status`;

  const controller = new AbortController();
  let timedOut = false;

  const timerId = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeoutMs);

  // Link caller signal if provided
  const callerSignal = options.signal;
  const onCallerAbort = () => {
    controller.abort();
  };
  if (callerSignal) {
    if (callerSignal.aborted) {
      clearTimeout(timerId);
      throw new DOMException('Operation aborted', 'AbortError');
    }
    callerSignal.addEventListener('abort', onCallerAbort, { once: true });
  }

  const startTime = performance.now();

  try {
    const response = await fetch(endpoint, {
      method: 'GET',
      headers: {
        Accept: 'application/json',
      },
      signal: controller.signal,
    });

    const latencyMs = Math.round(performance.now() - startTime);
    const headerRequestId = response.headers.get('x-request-id') ?? undefined;

    if (!response.ok) {
      let errorMessage = `Backend returned HTTP status ${response.status} (${response.statusText})`;
      let parsedRequestId = headerRequestId;

      try {
        const errorJson = (await response.json()) as ApiErrorResponse;
        if (errorJson?.error?.message) {
          errorMessage = errorJson.error.message;
        }
        if (errorJson?.error?.request_id) {
          parsedRequestId = errorJson.error.request_id;
        }
      } catch {
        // Non-JSON response body
      }

      throw new ApiClientError(
        errorMessage,
        'server_error',
        response.status,
        parsedRequestId
      );
    }

    let json: unknown;
    try {
      json = await response.json();
    } catch {
      throw new ApiClientError(
        'Backend returned an invalid, non-JSON response payload.',
        'malformed',
        response.status,
        headerRequestId
      );
    }

    if (!isStatusResponse(json)) {
      throw new ApiClientError(
        'Backend response is missing required fields or did not match the status schema.',
        'malformed',
        response.status,
        headerRequestId
      );
    }

    return {
      data: json,
      latencyMs,
      requestId: headerRequestId ?? json.request_id,
    };
  } catch (err: unknown) {
    if (err instanceof ApiClientError) {
      throw err;
    }

    if (timedOut) {
      throw new ApiClientError(
        `Request to ${endpoint} timed out after ${timeoutMs}ms.`,
        'timeout'
      );
    }

    if (err instanceof DOMException && err.name === 'AbortError') {
      throw err; // Re-throw unhandled caller abort
    }

    const message =
      err instanceof Error && err.message
        ? `Unable to connect to backend at ${baseUrl}: ${err.message}`
        : `Unable to connect to backend at ${baseUrl}.`;

    throw new ApiClientError(message, 'unreachable');
  } finally {
    clearTimeout(timerId);
    if (callerSignal) {
      callerSignal.removeEventListener('abort', onCallerAbort);
    }
  }
}

/**
 * Helper to transform an ApiClientError or Error into a structured ConnectionState
 */
export function toErrorConnectionState(err: unknown): ConnectionState {
  if (err instanceof ApiClientError) {
    return {
      status: 'error',
      errorType: err.errorType,
      message: err.message,
      statusCode: err.statusCode,
      requestId: err.requestId,
      attemptedAt: new Date(),
    };
  }

  const message =
    err instanceof Error ? err.message : 'Unknown network error occurred.';
  return {
    status: 'error',
    errorType: 'unreachable',
    message,
    attemptedAt: new Date(),
  };
}
