import React from 'react';
import { ConnectionState } from '../types/api';

interface StatusBadgeProps {
  state: ConnectionState;
}

export const StatusBadge: React.FC<StatusBadgeProps> = ({ state }) => {
  if (state.status === 'loading') {
    return (
      <span
        data-testid="status-badge"
        className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-amber-50 text-amber-800 border border-amber-200"
      >
        <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse" />
        Checking connection...
      </span>
    );
  }

  if (state.status === 'connected') {
    return (
      <span
        data-testid="status-badge"
        className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-emerald-50 text-emerald-800 border border-emerald-200"
      >
        <span className="w-2 h-2 rounded-full bg-emerald-500" />
        Connected (HTTP 200)
      </span>
    );
  }

  if (state.status === 'error') {
    const isTimeout = state.errorType === 'timeout';
    const isMalformed = state.errorType === 'malformed';
    const label = isTimeout
      ? 'Request Timeout'
      : isMalformed
      ? 'Malformed Response'
      : 'Backend Unavailable';

    return (
      <span
        data-testid="status-badge"
        className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-rose-50 text-rose-800 border border-rose-200"
      >
        <span className="w-2 h-2 rounded-full bg-rose-500" />
        {label}
      </span>
    );
  }

  return (
    <span
      data-testid="status-badge"
      className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-slate-100 text-slate-700 border border-slate-200"
    >
      <span className="w-2 h-2 rounded-full bg-slate-400" />
      Idle
    </span>
  );
};
