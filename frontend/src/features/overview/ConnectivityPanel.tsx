import React from 'react';
import { ConnectionState } from '../../types/api';
import { Card } from '../../components/Card';
import {
  Activity,
  CheckCircle2,
  AlertTriangle,
  Clock,
  RotateCcw,
  Globe,
  Radio,
  ExternalLink,
  ShieldAlert,
} from 'lucide-react';

interface ConnectivityPanelProps {
  connectionState: ConnectionState;
  onRetry: () => void | Promise<void>;
  apiBaseUrl: string;
}

export const ConnectivityPanel: React.FC<ConnectivityPanelProps> = ({
  connectionState,
  onRetry,
  apiBaseUrl,
}) => {
  const isLoading = connectionState.status === 'loading';
  const targetEndpoint = `${apiBaseUrl}/api/v1/status`;

  return (
    <Card className="overflow-hidden border border-slate-200">
      {/* Panel Header */}
      <div className="px-6 py-5 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-slate-50/50">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-emerald-100/70 text-emerald-700 flex items-center justify-center">
            <Radio className="w-5 h-5 text-emerald-600 animate-pulse" aria-hidden="true" />
          </div>
          <div>
            <h2 className="text-base font-semibold text-slate-900">
              Live Backend Connectivity
            </h2>
            <p className="text-xs text-slate-500">
              Direct verification against FastAPI <code className="bg-slate-100 px-1 py-0.5 rounded text-slate-700 font-mono text-[11px]">GET /api/v1/status</code>
            </p>
          </div>
        </div>

        {/* Retry Button */}
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onRetry}
            disabled={isLoading}
            data-testid="retry-button"
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-slate-700 bg-white border border-slate-300 hover:bg-slate-50 hover:border-slate-400 focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-900 disabled:opacity-50 disabled:cursor-not-allowed transition-colors shadow-sm"
          >
            <RotateCcw
              className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin text-emerald-600' : 'text-slate-500'}`}
              aria-hidden="true"
            />
            <span>{isLoading ? 'Checking...' : 'Retry Connection'}</span>
          </button>
        </div>
      </div>

      {/* Panel Body */}
      <div className="p-6">
        {/* Target Endpoint Info */}
        <div className="mb-6 flex flex-wrap items-center justify-between gap-2 p-3 rounded-lg bg-slate-50 text-xs border border-slate-200/60 font-mono text-slate-600">
          <div className="flex items-center gap-2">
            <Globe className="w-4 h-4 text-slate-400" aria-hidden="true" />
            <span className="font-semibold text-slate-700">Configured Base:</span>
            <span className="text-slate-900 break-all">{apiBaseUrl}</span>
          </div>
          <a
            href={targetEndpoint}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-emerald-600 hover:text-emerald-700 underline font-sans text-xs"
          >
            Direct JSON <ExternalLink className="w-3 h-3" />
          </a>
        </div>

        {/* State 1: Checking Connection (Loading) */}
        {connectionState.status === 'loading' && (
          <div
            data-testid="state-loading"
            className="py-12 flex flex-col items-center justify-center text-center space-y-3"
          >
            <div className="w-12 h-12 rounded-full bg-amber-50 text-amber-600 flex items-center justify-center animate-spin">
              <RotateCcw className="w-6 h-6" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-slate-900">
                Checking connection...
              </h3>
              <p className="text-xs text-slate-500 mt-1 max-w-sm">
                Sending HTTP request to <code className="font-mono text-slate-700">{targetEndpoint}</code>
              </p>
            </div>
          </div>
        )}

        {/* State 2: Connected with Full Response Details */}
        {connectionState.status === 'connected' && (
          <div data-testid="state-connected" className="space-y-6">
            <div className="flex items-start gap-3 p-4 rounded-lg bg-emerald-50/70 border border-emerald-200 text-emerald-900">
              <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" aria-hidden="true" />
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-semibold">
                    Backend reachable and responsive
                  </span>
                  <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-semibold bg-emerald-100 text-emerald-800 border border-emerald-300">
                    HTTP 200 OK
                  </span>
                </div>
                <p className="text-xs text-emerald-800">
                  Confirmed real-time response from FastAPI instance. Round-trip latency: <strong className="font-mono">{connectionState.latencyMs}ms</strong>.
                </p>
              </div>
            </div>

            {/* Response Details Grid */}
            <div>
              <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3">
                Authoritative Response Details
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                <div className="p-3 rounded-lg bg-white border border-slate-200 shadow-2xs">
                  <span className="block text-[11px] font-medium text-slate-500 uppercase">
                    Service
                  </span>
                  <span className="text-sm font-semibold text-slate-900 font-mono">
                    {connectionState.data.service}
                  </span>
                </div>

                <div className="p-3 rounded-lg bg-white border border-slate-200 shadow-2xs">
                  <span className="block text-[11px] font-medium text-slate-500 uppercase">
                    Version
                  </span>
                  <span className="text-sm font-semibold text-slate-900 font-mono">
                    v{connectionState.data.version}
                  </span>
                </div>

                <div className="p-3 rounded-lg bg-white border border-slate-200 shadow-2xs">
                  <span className="block text-[11px] font-medium text-slate-500 uppercase">
                    Environment
                  </span>
                  <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium capitalize bg-slate-100 text-slate-700 border border-slate-200">
                    {connectionState.data.environment}
                  </span>
                </div>

                <div className="p-3 rounded-lg bg-white border border-slate-200 shadow-2xs">
                  <span className="block text-[11px] font-medium text-slate-500 uppercase">
                    API Version
                  </span>
                  <span className="text-sm font-semibold text-slate-900 font-mono">
                    {connectionState.data.api_version}
                  </span>
                </div>

                <div className="p-3 rounded-lg bg-white border border-slate-200 shadow-2xs sm:col-span-2">
                  <span className="block text-[11px] font-medium text-slate-500 uppercase">
                    Request ID
                  </span>
                  <span className="text-xs font-semibold text-slate-800 font-mono break-all">
                    {connectionState.data.request_id}
                  </span>
                </div>

                <div className="p-3 rounded-lg bg-white border border-slate-200 shadow-2xs sm:col-span-3">
                  <span className="block text-[11px] font-medium text-slate-500 uppercase">
                    Server Timestamp (UTC)
                  </span>
                  <span className="text-xs font-semibold text-slate-800 font-mono">
                    {connectionState.data.time_utc}
                  </span>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* State 3: Error States (Unavailable / Timeout / Malformed) */}
        {connectionState.status === 'error' && (
          <div data-testid="state-error" className="space-y-4">
            {connectionState.errorType === 'timeout' ? (
              <div className="p-4 rounded-lg bg-amber-50 border border-amber-200 text-amber-900 space-y-2">
                <div className="flex items-center gap-2">
                  <Clock className="w-5 h-5 text-amber-600 shrink-0" aria-hidden="true" />
                  <span className="text-sm font-semibold">Request Timeout</span>
                </div>
                <p className="text-xs text-amber-800">{connectionState.message}</p>
                <p className="text-xs text-amber-700">
                  The backend did not respond within the 5000ms threshold. Verify that the server process is alive and unblocked.
                </p>
              </div>
            ) : connectionState.errorType === 'malformed' ? (
              <div className="p-4 rounded-lg bg-rose-50 border border-rose-200 text-rose-900 space-y-2">
                <div className="flex items-center gap-2">
                  <AlertTriangle className="w-5 h-5 text-rose-600 shrink-0" aria-hidden="true" />
                  <span className="text-sm font-semibold">Malformed Response</span>
                </div>
                <p className="text-xs text-rose-800">{connectionState.message}</p>
                <p className="text-xs text-rose-700">
                  The server responded, but the JSON contract was missing expected fields. No mock payload was substituted.
                </p>
              </div>
            ) : (
              <div className="p-4 rounded-lg bg-rose-50 border border-rose-200 text-rose-900 space-y-2">
                <div className="flex items-center gap-2">
                  <ShieldAlert className="w-5 h-5 text-rose-600 shrink-0" aria-hidden="true" />
                  <span className="text-sm font-semibold">Backend Unavailable</span>
                  {connectionState.statusCode && (
                    <span className="text-xs font-mono px-1.5 py-0.5 rounded bg-rose-100 text-rose-800 border border-rose-200">
                      HTTP {connectionState.statusCode}
                    </span>
                  )}
                </div>
                <p className="text-xs text-rose-800">{connectionState.message}</p>
                <div className="text-xs text-rose-700 bg-rose-100/60 p-2.5 rounded border border-rose-200/60 space-y-1">
                  <div className="font-semibold text-rose-900">Troubleshooting Steps:</div>
                  <ul className="list-disc list-inside space-y-0.5 text-rose-800">
                    <li>
                      Ensure FastAPI backend is running locally: <code className="font-mono bg-white/80 px-1 py-0.2 rounded">python -m app</code> in <code className="font-mono bg-white/80 px-1 py-0.2 rounded">backend/</code>.
                    </li>
                    <li>
                      Verify origin is allowed in CORS allowlist: <code className="font-mono bg-white/80 px-1 py-0.2 rounded">FRONTEND_ORIGINS</code> (default: <code className="font-mono bg-white/80 px-1 py-0.2 rounded">http://localhost:5173,http://127.0.0.1:5173</code>).
                    </li>
                    <li>
                      Check that <code className="font-mono bg-white/80 px-1 py-0.2 rounded">VITE_API_BASE_URL</code> points to the correct host and port.
                    </li>
                  </ul>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Footer Audit Guarantee */}
      <div className="px-6 py-3 bg-slate-50 border-t border-slate-100 flex items-center justify-between text-[11px] text-slate-500">
        <span className="flex items-center gap-1.5">
          <Activity className="w-3.5 h-3.5 text-slate-400" />
          Strict verification mode (mocking disabled in production client)
        </span>
        <span className="font-mono text-slate-400">Phase 1B Gate</span>
      </div>
    </Card>
  );
};
