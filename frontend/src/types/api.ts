/**
 * Authoritative response contract from FastAPI GET /api/v1/status.
 * Matches backend/app/api/v1/status.py StatusResponse.
 */
export interface StatusResponse {
  status: 'ok';
  service: string;
  version: string;
  environment: string;
  api_version: 'v1';
  time_utc: string;
  request_id: string;
}

/**
 * Standard backend error response contract from docs/DATA_API_CONTRACTS.md §5
 * and backend/app/core/errors.py.
 */
export interface ApiErrorPayload {
  code: string;
  message: string;
  request_id?: string;
}

export interface ApiErrorResponse {
  error: ApiErrorPayload;
}

export type ConnectionState =
  | { status: 'idle' }
  | { status: 'loading' }
  | {
      status: 'connected';
      data: StatusResponse;
      latencyMs: number;
      fetchedAt: Date;
    }
  | {
      status: 'error';
      errorType: 'unreachable' | 'timeout' | 'malformed' | 'server_error';
      message: string;
      statusCode?: number;
      requestId?: string;
      attemptedAt: Date;
    };
