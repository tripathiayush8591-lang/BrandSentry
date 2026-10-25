import { useDemoMode } from '../preview/demo-context';
import { useEffect, useState } from 'react';
import { Card } from '../../components/Card';
import { useAuth } from '../auth/auth-context';
import { useBrandApi } from '../../services/useBrandApi';
import type { InsightsSummary } from '../../types/insights';

const labels: Record<string, string> = {
  pending: 'Pending', running: 'Running', completed: 'Completed', partial: 'Partial', failed: 'Failed',
  in_review: 'In review', approved: 'Approved', changes_requested: 'Changes requested',
};

function Counts({ counts }: { counts: Record<string, number> }) {
  return <dl className="space-y-3">{Object.entries(counts).map(([name, count]) =>
    <div key={name} className="flex justify-between gap-4"><dt>{labels[name] ?? name}</dt><dd className="font-semibold tabular-nums">{count}</dd></div>
  )}</dl>;
}

export function InsightsView() {
  const { session } = useAuth();
  const brandApi = useBrandApi();
  const demo = useDemoMode();
  const allowed = demo || session?.role === 'admin' || session?.role === 'reviewer';
  const [data, setData] = useState<InsightsSummary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [refresh, setRefresh] = useState(0);
  useEffect(() => {
    if (!allowed) return;
    let active = true;
    setData(null); setError(null); setLoading(true);
    brandApi.getInsights().then((result) => {
      if (active) setData(result);
    }).catch((err: unknown) => {
      if (active) setError(err instanceof Error ? err.message : 'Unable to load governance summary.');
    }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [allowed, session?.workspace.id, refresh, brandApi]);

  return <div className="max-w-7xl mx-auto space-y-6">
    <div className="flex flex-wrap items-center justify-between gap-4">
      <h1 className="text-2xl font-bold">Governance insights</h1>
      {allowed && <button className="neu-btn-secondary px-4 py-2" disabled={loading} onClick={() => setRefresh((n) => n + 1)}>Refresh summary</button>}
    </div>
    <p className="text-sm text-slate-600 dark:text-slate-400">All recorded runs in this workspace, including repeat validations and historical versions. These are counts, not trends or unique issues. Historical approvals do not approve current content.</p>
    {!allowed ? <p role="alert">Governance insights require an admin or reviewer role.</p> :
      loading ? <p role="status">Loading governance summary…</p> : error ? <p role="alert">{error}</p> : data && <>
        {data.is_demo && <p className="text-sm">{demo ? 'Synthetic metrics from the sample records — no live activity or provider results.' : 'Isolated demo workspace — counts reflect recorded demo activity.'}</p>}
        <Card className="p-6 space-y-3"><h2 className="text-lg font-semibold">Validation runs: {data.validation_runs}</h2>
          {data.validation_runs === 0 && <p>No validation runs recorded. There are no findings or review outcomes to summarize yet.</p>}
          <Counts counts={data.run_states} />
          <p className="text-sm text-slate-600 dark:text-slate-400">Pending, running, partial and failed runs are incomplete validation, even when no findings are recorded.</p>
        </Card>
        <Card className="p-6 space-y-3"><h2 className="text-lg font-semibold">Machine findings</h2>
          <p className="text-sm text-slate-600 dark:text-slate-400">SUPPORTED records the system evidence assessment, not independent fact verification. NEEDS_VERIFICATION remains unverified regardless of human review.</p>
          {data.findings.length === 0 ? <p>No findings recorded.</p> : <ul className="space-y-3">{data.findings.map((row) =>
            <li key={`${row.source}-${row.verification_status}`} className="flex flex-wrap justify-between gap-2"><span>{row.source === 'ai' ? 'AI-generated' : row.source === 'deterministic' ? 'Deterministic' : row.source} · {row.verification_status}</span><strong>{row.count}</strong></li>
          )}</ul>}
        </Card>
        {data.categories.length > 0 && <Card className="p-6 space-y-3"><h2 className="text-lg font-semibold">Recorded categories</h2>
          <ul className="space-y-3">{data.categories.map((row) => <li key={`${row.category}-${row.source}`} className="flex flex-wrap justify-between gap-2"><span className="break-all">{row.category} · {row.source === 'ai' ? 'AI-generated' : row.source}</span><strong>{row.count}</strong></li>)}</ul>
        </Card>}
        <Card className="p-6 space-y-3"><h2 className="text-lg font-semibold">Human review progress</h2>
          <p className="text-sm text-slate-600 dark:text-slate-400">One status per recorded run. Approved and changes requested are finalized human outcomes, including historical reviews. Pending includes incomplete runs that cannot yet be reviewed.</p>
          <Counts counts={data.review_progress} />
        </Card>
      </>}
  </div>;
}
