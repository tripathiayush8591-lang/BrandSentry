import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Card } from '../../components/Card';
import { brandApi } from '../../services/brand-api';
import type { ValidationRunSummary } from '../../types/validation';
import {
  ShieldCheck,
  ArrowRight,
  RefreshCw,
  Zap,
  FileText,
} from 'lucide-react';

export const ValidationRunsView: React.FC = () => {
  const [runs, setRuns] = useState<ValidationRunSummary[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<string>('all');

  const loadRuns = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await brandApi.listValidationRuns(50);
      setRuns(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load validation runs');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadRuns();
  }, []);

  const filteredRuns = runs.filter((r) => {
    if (statusFilter === 'all') return true;
    return r.state === statusFilter;
  });

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
              Validation Runs
            </h1>
            <span className="text-[11px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-full bg-brand-100 dark:bg-brand-900/40 text-brand-700 dark:text-brand-300 border border-brand-200 dark:border-brand-800">
              Governance Audit
            </span>
          </div>
          <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 mt-1">
            Complete execution history of brand governance validations, evidence citations, and deterministic rule checks.
          </p>
        </div>

        <div className="flex items-center gap-2">
          {/* Filter Pills */}
          <div className="neu-inset-sm p-1 inline-flex items-center gap-1 bg-slate-100 dark:bg-slate-900/60 border border-slate-200/80 dark:border-slate-800 text-xs">
            {['all', 'completed', 'partial', 'failed'].map((st) => (
              <button
                key={st}
                type="button"
                onClick={() => setStatusFilter(st)}
                aria-pressed={statusFilter === st}
                className={`px-2.5 py-1 rounded-lg capitalize transition-all ${
                  statusFilter === st
                    ? 'neu-card-sm text-brand-600 dark:text-brand-400 font-semibold shadow-sm'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                {st}
              </button>
            ))}
          </div>

          <button
            type="button"
            onClick={loadRuns}
            className="p-2 rounded-xl neu-btn-secondary text-xs flex items-center justify-center"
            title="Refresh runs"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* Error message */}
      {error && (
        <div className="p-3.5 rounded-xl border border-rose-200 dark:border-rose-800 bg-rose-50 dark:bg-rose-950/40 text-rose-800 dark:text-rose-300 text-xs">
          {error}
        </div>
      )}

      {/* Runs Table */}
      <Card className="overflow-hidden">
        <div className="p-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
          <h2 className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
            Recorded Runs ({filteredRuns.length})
          </h2>
          <span className="text-xs text-slate-500">Synchronous & Cache-Tracked</span>
        </div>

        {loading && runs.length === 0 ? (
          <div className="p-10 text-center text-xs text-slate-500">Loading validation history...</div>
        ) : filteredRuns.length === 0 ? (
          <div className="p-12 text-center space-y-3">
            <ShieldCheck className="w-9 h-9 text-slate-300 dark:text-slate-600 mx-auto" />
            <p className="text-sm font-semibold text-slate-700 dark:text-slate-300">No validation runs found</p>
            <p className="text-xs text-slate-500 max-w-sm mx-auto">
              Draft a submission in the Content Studio and click &quot;Validate&quot; to execute your first brand governance evaluation.
            </p>
            <Link
              to="/studio"
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl neu-btn-primary text-xs mt-2"
            >
              Open Content Studio
            </Link>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 dark:bg-slate-800/50 text-slate-500 uppercase tracking-wider font-semibold border-b border-slate-100 dark:border-slate-800">
                <tr>
                  <th className="py-3 px-4">Run ID</th>
                  <th className="py-3 px-4">State</th>
                  <th className="py-3 px-4">AI Engine Status</th>
                  <th className="py-3 px-4 text-center">Cache</th>
                  <th className="py-3 px-4 text-center">Findings</th>
                  <th className="py-3 px-4">Executed At</th>
                  <th className="py-3 px-4 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {filteredRuns.map((run) => (
                  <tr
                    key={run.id}
                    className="hover:bg-slate-50/60 dark:hover:bg-slate-800/30 transition-colors"
                  >
                    <td className="py-3.5 px-4 font-mono font-medium text-slate-900 dark:text-white">
                      <div className="flex items-center gap-1.5">
                        <FileText className="w-3.5 h-3.5 text-brand-500" />
                        <span>{run.id.slice(0, 16)}...</span>
                      </div>
                    </td>
                    <td className="py-3.5 px-4">
                      <span
                        className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full font-semibold uppercase text-[10px] ${
                          run.state === 'completed'
                            ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800'
                            : run.state === 'partial'
                            ? 'bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300 border border-amber-200 dark:border-amber-800'
                            : 'bg-rose-100 text-rose-800 dark:bg-rose-950/60 dark:text-rose-300 border border-rose-200 dark:border-rose-800'
                        }`}
                      >
                        {run.state}
                      </span>
                    </td>
                    <td className="py-3.5 px-4">
                      <span
                        className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium ${
                          run.ai_status === 'complete'
                            ? 'bg-brand-100 text-brand-800 dark:bg-brand-950/60 dark:text-brand-300'
                            : run.ai_status === 'unavailable'
                            ? 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300'
                            : 'bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300'
                        }`}
                      >
                        {run.ai_status === 'unavailable' ? 'Deterministic Only' : run.ai_status}
                      </span>
                    </td>
                    <td className="py-3.5 px-4 text-center">
                      {run.cache_hit ? (
                        <span className="inline-flex items-center gap-0.5 text-[10px] font-semibold text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/50 px-1.5 py-0.5 rounded">
                          <Zap className="w-2.5 h-2.5" /> Hit
                        </span>
                      ) : (
                        <span className="text-[10px] text-slate-500">Miss</span>
                      )}
                    </td>
                    <td className="py-3.5 px-4 text-center">
                      <span
                        className={`font-mono font-bold px-2 py-0.5 rounded-full text-xs ${
                          run.finding_count > 0
                            ? 'bg-amber-100 text-amber-900 dark:bg-amber-950/60 dark:text-amber-200'
                            : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400'
                        }`}
                      >
                        {run.finding_count}
                      </span>
                    </td>
                    <td className="py-3.5 px-4 text-slate-500 font-mono text-[11px]">
                      {new Date(run.created_at).toLocaleString([], {
                        month: 'short',
                        day: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </td>
                    <td className="py-3.5 px-4 text-right">
                      <Link to={`/runs/${run.id}`} aria-label={`Inspect run ${run.id}`} className="inline-flex items-center gap-1 text-xs font-semibold text-brand-600 dark:text-brand-400 hover:underline min-h-10">
                        Inspect <ArrowRight className="w-3.5 h-3.5" />
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
};
