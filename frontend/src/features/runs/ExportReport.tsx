import { useState } from 'react';
import { useBrandApi } from '../../services/useBrandApi';
import { serializeReport } from './report';
import { useDemoMode } from '../preview/demo-context';

export function ExportReport({ runId }: { runId: string }) {
  const brandApi = useBrandApi();
  const demo = useDemoMode();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function download() {
    setBusy(true); setError(null);
    try {
      // Refresh persisted state so the report never relies on unsent UI edits.
      const review = await brandApi.getReview(runId);
      const url = URL.createObjectURL(new Blob([serializeReport(review)], { type: 'application/json' }));
      const link = document.createElement('a');
      link.href = url; link.download = `brandsentry-${review.run.id}.json`;
      document.body.appendChild(link); link.click(); link.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not export the report. Retry when the backend is available.');
    } finally { setBusy(false); }
  }
  return <div className="space-y-2">
    <button className="neu-btn-secondary px-4 py-2" disabled={busy || demo} onClick={() => void download()}>{demo ? 'Report export — Available in connected mode' : busy ? 'Exporting report…' : 'Export validation/review JSON'}</button>
    {error && <p role="alert" className="text-sm">{error}</p>}
  </div>;
}
