import React, { useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { Card } from '../../components/Card';
import { useHumanReview } from './useHumanReview';
import { ExportReport } from './ExportReport';
import { ReviewSummary, FindingReview, FinalReview } from './HumanReview';
import {
  ShieldAlert,
  ArrowLeft,
  CheckCircle2,
  AlertTriangle,
  Copy,
  Check,
  Layers,
  Info,
} from 'lucide-react';

export const EvidenceFindingsView: React.FC = () => {
  const { runId } = useParams<{ runId: string }>();
  return <ReviewRun key={runId} runId={runId ?? ''} />;
};

function ReviewRun({ runId }: { runId: string }) {
  const controller = useHumanReview(runId);
  const { review, loading, error } = controller;
  const run = review?.run;
  const [copiedText, setCopiedText] = useState<string | null>(null);
  const [highlightedChunkId, setHighlightedChunkId] = useState<string | null>(null);
  const [copyError, setCopyError] = useState<string | null>(null);

  const handleCopy = async (text: string) => {
    setCopyError(null);
    try {
      await navigator.clipboard.writeText(text);
      setCopiedText(text);
      setTimeout(() => setCopiedText(null), 2000);
    } catch {
      setCopyError('Could not copy the suggestion. Select the text to copy it manually.');
    }
  };

  if (loading) {
    return (
      <div className="py-16 text-center space-y-3">
        <div className="w-8 h-8 rounded-full border-2 border-brand-600 border-t-transparent animate-spin mx-auto" />
        <p className="text-xs text-slate-500">Loading findings and sources…</p>
      </div>
    );
  }

  if (!review || !run) {
    return (
      <div className="py-16 text-center space-y-4 max-w-md mx-auto">
        <ShieldAlert className="w-10 h-10 text-rose-500 mx-auto" />
        <h2 className="text-lg font-bold text-slate-900 dark:text-white">Review unavailable</h2>
        <p role="alert" className="text-xs text-slate-500">{error ?? 'Unable to find the specified validation run.'}</p>
        <button className="neu-btn-secondary px-4 py-2" disabled={controller.busy} onClick={() => void controller.reload()}>Retry loading review</button>
        <Link to="/runs" className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl neu-btn-primary text-xs">
          <ArrowLeft className="w-3.5 h-3.5" /> Return to Validation Runs
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-7xl mx-auto" aria-busy={controller.busy}>
      {copyError && <p role="alert" className="text-sm text-rose-700 dark:text-rose-300">{copyError}</p>}
      <span role="status" className="sr-only">{copiedText ? 'Replacement copied to clipboard.' : ''}</span>
      <ExportReport runId={runId} />
      {/* Back link & Title */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <Link
            to="/runs"
            className="inline-flex items-center gap-1.5 text-xs text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 mb-2 transition-colors font-semibold"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>Back to All Runs</span>
          </Link>
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
              Evidence & Findings
            </h1>
            <span className="text-[11px] font-mono px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400">
              {run.id.slice(0, 16)}...
            </span>
          </div>
        </div>

        {/* Status badges */}
        <div className="flex items-center gap-2 flex-wrap">
          <span
            className={`px-3 py-1 rounded-full text-xs font-semibold uppercase tracking-wider ${
              run.state === 'completed'
                ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800'
                : 'bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300 border border-amber-200 dark:border-amber-800'
            }`}
          >
            Check status: {run.state}
          </span>

          <span className="px-3 py-1 rounded-full text-xs font-semibold bg-brand-100 text-brand-800 dark:bg-brand-950/60 dark:text-brand-300 border border-brand-200 dark:border-brand-800">
            AI analysis: {run.ai_status}
          </span>
        </div>
      </div>

      <ReviewSummary controller={controller} />

      {/* Honest AI provider transparency callout */}
      {run.ai_status === 'unavailable' && (
        <div className="p-4 rounded-xl border border-brand-200/80 dark:border-brand-900/80 bg-brand-50/70 dark:bg-brand-950/30 text-xs text-brand-950 dark:text-brand-200 flex items-start gap-3">
          <Info className="w-4 h-4 text-brand-600 shrink-0 mt-0.5" />
          <div className="space-y-1">
            <p className="font-semibold">AI analysis unavailable</p>
            <p className="text-slate-600 dark:text-brand-300 leading-relaxed">
              AI analysis was unavailable for this run. Review the recorded findings and evidence below; this result does not imply human approval.
            </p>
          </div>
        </div>
      )}

      {/* Overview Metric Row */}
      <div className="grid grid-cols-2 gap-3">
        <Card className="p-3.5">
          <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider block">
            Total Findings
          </span>
          <span className="text-xl font-bold tabular-nums text-slate-900 dark:text-white">
            {run.findings.length}
          </span>
        </Card>

        <Card className="p-3.5">
          <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider block">
            Sources
          </span>
          <span className="text-xl font-bold tabular-nums text-slate-900 dark:text-white">
            {run.evidence.length}
          </span>
        </Card>


      </div>

      <details className="service-details">
        <summary>Check details</summary>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Card className="p-3.5">
          <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider block">
            AI Latency
          </span>
          <span className="text-xl font-bold tabular-nums text-slate-900 dark:text-white">
            {run.provider_latency_ms != null ? `${run.provider_latency_ms}ms` : '—'}
          </span>
        </Card>

        <Card className="p-3.5">
          <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider block">
            Prompt / Model
          </span>
          <span className="text-sm font-sans text-slate-700 dark:text-slate-300 truncate block mt-1">
            {run.model_id ? `${run.model_id}` : `p_ver:${run.prompt_version}`}
          </span>
        </Card>
        </div>
        <p className="mt-3 text-xs">{run.cache_hit ? 'Reused a matching previous analysis.' : 'New analysis.'}</p>
      </details>

      {/* Findings & Evidence Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Column: Structured Findings (7 cols) */}
        <div className="lg:col-span-7 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300 flex items-center gap-2">
              <ShieldAlert className="w-4 h-4 text-amber-500" />
              Governance Findings ({run.findings.length})
            </h2>
          </div>

          {run.findings.length === 0 ? (
            <Card className="p-8 text-center space-y-2">
              <CheckCircle2 className="w-8 h-8 text-emerald-500 mx-auto" />
              <p className="text-sm font-semibold text-slate-800 dark:text-slate-200">
                No policy violations detected
              </p>
              <p className="text-xs text-slate-500 max-w-sm mx-auto">
                This run recorded no findings. Check its run and AI status before deciding what to do next. Human review is still required.
              </p>
            </Card>
          ) : (
            <div className="space-y-4">
              {run.findings.map((f, idx) => {
                const isSupported = f.verification_status === 'SUPPORTED';
                const isNeedsVerification = f.verification_status === 'NEEDS_VERIFICATION';

                return (
                  <Card key={f.id ?? idx} className="p-5 space-y-3.5">
                    <p className="text-xs font-semibold">Original {f.source === 'ai' ? 'AI assessment' : 'deterministic assessment'} · Finding {idx + 1}</p>
                    {/* Header: Severity & Verification Status */}
                    <div className="flex items-center justify-between gap-2 flex-wrap">
                      <div className="flex items-center gap-2">
                        <span
                          className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full ${
                            f.severity === 'high'
                              ? 'bg-rose-100 text-rose-800 dark:bg-rose-950/60 dark:text-rose-300 border border-rose-200 dark:border-rose-800'
                              : f.severity === 'medium'
                              ? 'bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300 border border-amber-200 dark:border-amber-800'
                              : 'bg-brand-100 text-brand-800 dark:bg-brand-950/60 dark:text-brand-300 border border-brand-200 dark:border-brand-800'
                          }`}
                        >
                          {f.severity} severity
                        </span>

                        <span className="text-[10px] font-semibold uppercase px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300">
                          Source: {f.source}
                        </span>
                      </div>

                      <span
                        className={`text-[10px] font-bold uppercase tracking-wider px-2.5 py-0.5 rounded-full ${
                          isSupported
                            ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800'
                            : isNeedsVerification
                            ? 'bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300 border border-amber-200 dark:border-amber-800'
                            : 'bg-rose-100 text-rose-800 dark:bg-rose-950/60 dark:text-rose-300'
                        }`}
                      >
                        {f.verification_status}
                      </span>
                    </div>

                    {/* Rule / Category */}
                    <div>
                      <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
                        Category: <strong className="text-slate-800 dark:text-slate-200 capitalize">{f.category.replace('_', ' ')}</strong>
                      </span>
                    </div>

                    {/* Quoted Snippet */}
                    <div className="p-2.5 rounded-xl bg-rose-50/80 dark:bg-rose-950/30 border border-rose-200/80 dark:border-rose-900/40 text-xs">
                      <span className="text-[10px] uppercase font-bold text-rose-700 dark:text-rose-400 block mb-0.5">
                        Flagged Content Snippet
                      </span>
                      <p className="font-sans text-rose-950 dark:text-rose-200 font-semibold">
                        &quot;{f.snippet}&quot;
                      </p>
                    </div>

                    {/* Explanation */}
                    <p className="text-xs text-slate-700 dark:text-slate-300 leading-relaxed">
                      {f.explanation}
                    </p>

                    {/* Needs verification reason (if applicable) */}
                    {f.needs_verification_reason && (
                      <div className="p-2 rounded-lg bg-amber-50 dark:bg-amber-950/30 border border-amber-200/80 dark:border-amber-900/40 text-[11px] text-amber-800 dark:text-amber-300 flex items-start gap-1.5">
                        <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                        <span><strong>Verification note:</strong> {f.needs_verification_reason}</span>
                      </div>
                    )}

                    {/* Suggested Replacement */}
                    {f.suggested_text && (
                      <div className="p-2.5 rounded-xl bg-emerald-50/80 dark:bg-emerald-950/30 border border-emerald-200/80 dark:border-emerald-900/40 text-xs flex items-center justify-between gap-2">
                        <div>
                          <span className="text-[10px] uppercase font-bold text-emerald-700 dark:text-emerald-400 block mb-0.5">
                            Suggested Alternative Phrasing
                          </span>
                          <span className="font-sans text-emerald-950 dark:text-emerald-200 font-semibold">
                            {f.suggested_text}
                          </span>
                        </div>
                        <button
                          type="button"
                          onClick={() => handleCopy(f.suggested_text!)}
                          className="p-1.5 rounded-lg bg-white dark:bg-slate-800 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-700 hover:bg-emerald-100 text-xs flex items-center gap-1 shadow-2xs"
                          title="Copy replacement"
                          aria-label={copiedText === f.suggested_text ? 'Replacement copied' : 'Copy replacement'}
                        >
                          {copiedText === f.suggested_text ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                        </button>
                      </div>
                    )}

                    {/* Cited Sources */}
                    {f.evidence_chunk_ids && f.evidence_chunk_ids.length > 0 && (
                      <div className="pt-2 border-t border-slate-100 dark:border-slate-800 text-[11px]">
                        <span className="text-slate-500 font-semibold">Cited Sources: </span>
                        <div className="inline-flex gap-1.5 flex-wrap mt-1">
                          {f.evidence_chunk_ids.map((chunkId) => (
                            <a
                              key={chunkId}
                              href={`#evidence-${chunkId}`}
                              onClick={() => setHighlightedChunkId(chunkId)}
                              className="font-mono px-2 py-0.5 rounded bg-brand-50 dark:bg-brand-950/50 text-brand-600 dark:text-brand-400 border border-brand-200 dark:border-brand-800 hover:underline"
                            >
                              #{chunkId.slice(0, 8)}
                            </a>
                          ))}
                        </div>
                      </div>
                    )}
                    {f.evidence_chunk_ids.length === 0 && <p className="text-xs text-slate-500">No evidence cited. Human judgment does not verify missing sources.</p>}
                    {f.evidence_chunk_ids.some((id) => !run.evidence.some((ev) => ev.chunk_id === id)) && <p className="text-xs text-slate-500">A cited snapshot is unavailable. Source verification remains unchanged.</p>}
                    <FindingReview findingId={f.id} index={idx} review={review} disabled={!controller.canReview} onDecide={controller.decide} />
                  </Card>
                );
              })}
            </div>
          )}
        </div>

        {/* Right Column: Evidence Snapshot (5 cols) */}
        <div className="lg:col-span-5 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300 flex items-center gap-2">
              <Layers className="w-4 h-4 text-brand-500" />
              Evidence Snapshot ({run.evidence.length})
            </h2>
            <span className="text-[11px] text-slate-500">Saved excerpts</span>
          </div>

          {run.evidence.length === 0 ? (
            <Card className="p-8 text-center text-xs text-slate-500">
              No supporting sources were cited for this check.
            </Card>
          ) : (
            <div className="space-y-3 max-h-[700px] overflow-y-auto p-1">
              {run.evidence.map((ev) => {
                const isTarget = highlightedChunkId === ev.chunk_id;
                return (
                  <div
                    key={ev.id}
                    id={`evidence-${ev.chunk_id}`}
                    tabIndex={-1}
                    className={`p-3.5 rounded-xl border text-xs space-y-2 transition-all ${
                      isTarget
                        ? 'neu-card ring-2 ring-brand-500 bg-brand-50/50 dark:bg-brand-950/40 border-brand-300'
                        : 'neu-card bg-white dark:bg-slate-900 border-slate-200/80 dark:border-slate-800'
                    }`}
                  >
                    <div className="flex items-center justify-between font-semibold text-slate-900 dark:text-white">
                      <span className="truncate">{ev.document_title}</span>
                      <span className="text-[10px] font-mono text-brand-600 dark:text-brand-400 bg-brand-50 dark:bg-brand-950/60 px-1.5 py-0.5 rounded">
                        {ev.section_ref}
                      </span>
                    </div>

                    <div className="flex items-center justify-between text-[10px] text-slate-500">
                      <span>Ver: v{ev.document_version}</span>
                      {ev.page_start && (
                        <span>
                          Pages {ev.page_start}
                          {ev.page_end && ev.page_end !== ev.page_start ? `–${ev.page_end}` : ''}
                        </span>
                      )}
                    </div>

                    <p className="font-sans text-sm text-slate-700 dark:text-slate-300 bg-slate-50 dark:bg-slate-800/50 p-2.5 rounded-lg whitespace-pre-wrap leading-relaxed">
                      {ev.text}
                    </p>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
      <FinalReview controller={controller} />
    </div>
  );
}
