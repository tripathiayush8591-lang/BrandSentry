import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ConnectionState } from '../../types/api';
import { ConnectivityPanel } from './ConnectivityPanel';
import { Card } from '../../components/Card';
import { brandApi } from '../../services/brand-api';
import { useAuth } from '../auth/auth-context';
import { ArrowRight, PlusCircle, BookOpen, Sliders } from 'lucide-react';
import type { ValidationRunSummary, ContentSubmission } from '../../types/validation';
interface OverviewViewProps {
  connectionState: ConnectionState;
  onRetry: () => void | Promise<void>;
  apiBaseUrl: string;
}
export const OverviewView: React.FC<OverviewViewProps> = ({
  connectionState,
  onRetry,
  apiBaseUrl,
}) => {
  const { session } = useAuth();
  const [docCount, setDocCount] = useState<number | null>(null);
  const [ruleCount, setRuleCount] = useState<number | null>(null);
  const [submissions, setSubmissions] = useState<ContentSubmission[] | null>(null);
  const [runs, setRuns] = useState<ValidationRunSummary[] | null>(null);
  const [metricsError, setMetricsError] = useState(false);
  const [loadingMetrics, setLoadingMetrics] = useState(false);
  useEffect(() => {
    let isMounted = true;
    if (session) {
      setLoadingMetrics(true);
      setMetricsError(false);
      Promise.allSettled([
        brandApi.listDocuments(),
        brandApi.listRules(),
        brandApi.listSubmissions(5),
        brandApi.listValidationRuns(5),
      ]).then(([docsRes, rulesRes, subsRes, runsRes]) => {
        if (!isMounted) return;
        setMetricsError([docsRes, rulesRes, subsRes, runsRes].some((result) => result.status === 'rejected'));
        if (docsRes.status === 'fulfilled' && Array.isArray(docsRes.value)) setDocCount(docsRes.value.length);
        if (rulesRes.status === 'fulfilled' && Array.isArray(rulesRes.value)) setRuleCount(rulesRes.value.length);
        if (subsRes.status === 'fulfilled' && Array.isArray(subsRes.value)) setSubmissions(subsRes.value);
        if (runsRes.status === 'fulfilled' && Array.isArray(runsRes.value)) setRuns(runsRes.value);
        setLoadingMetrics(false);
      });
    }
    return () => {
      isMounted = false;
    };
  }, [session]);

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      <div className="flex items-end justify-between gap-4">
        <div>
          <p className="text-sm text-slate-500 dark:text-slate-400 mb-1">{session?.workspace.name ?? 'Your workspace'}</p>
          <h1 className="text-2xl font-bold tracking-tight">Your brand, in good hands.</h1>
        </div>
      </div>
      {metricsError && <p role="status" className="overview-note">Some counts could not be loaded. Unavailable values are shown as a dash.</p>}
      <section className="overview-bento" aria-label="Workspace overview">
        <div className="overview-hero neu-card">
          <div className="hero-eyebrow"><img src="/images/brandsentry-icon.png" alt="" className="brand-icon" /> Ready for your next idea</div>
          <div className="space-y-4">
            <h2>On brand. Backed by evidence.</h2>
            <p>Check your content against your guidelines. See what needs attention before you publish.</p>
          </div>
          <Link to="/studio" className="hero-cta"><PlusCircle size={18} /> Create a submission <ArrowRight size={16} /></Link>
        </div>
        <Card className="bento-vault">
          <div className="flex items-center justify-between gap-3"><h2 className="bento-label">Your guidelines</h2><BookOpen size={20} aria-hidden="true" /></div>
          <div className="bento-count">{loadingMetrics ? '—' : (docCount ?? '—')}</div>
          <Link to="/vault" className="bento-link">Upload or manage guidelines <ArrowRight size={15} /></Link>
        </Card>
        <Card className="bento-rules">
          <div className="flex items-center justify-between gap-3"><h2 className="bento-label">Brand rules</h2><Sliders size={20} aria-hidden="true" /></div>
          <div className="bento-count">{loadingMetrics ? '—' : (ruleCount ?? '—')}</div>
          <Link to="/vault" className="bento-link text-brand-700 dark:text-brand-300">Manage terms and phrasing <ArrowRight size={15} /></Link>
        </Card>
        <Card className="bento-bottom">
          <div>
            <h2 className="bento-label">Recent submissions <span className="text-slate-500 dark:text-slate-400">· {loadingMetrics ? '—' : (submissions?.length ?? '—')}</span></h2>
            <p className="overview-note">Pick up a draft or start something new.</p>
            <Link to="/studio" className="bento-link text-brand-700 dark:text-brand-300">Open Content Studio <ArrowRight size={15} /></Link>
          </div>
          <div>
            <h2 className="bento-label">Recent checks <span className="text-slate-500 dark:text-slate-400">· {loadingMetrics ? '—' : (runs?.length ?? '—')}</span></h2>
            <p className="overview-note">Revisit your findings and supporting sources.</p>
            <Link to="/runs" className="bento-link text-brand-700 dark:text-brand-300">View check history <ArrowRight size={15} /></Link>
          </div>
        </Card>
      </section>
      <p className="overview-note">Missing evidence is marked Needs Verification. Final decisions stay with people.</p>
      {connectionState.status === 'error' && <p role="status" className="text-sm text-rose-700 dark:text-rose-300">We couldn’t connect. Some actions may be unavailable. <button className="underline font-semibold" onClick={() => void onRetry()}>Try again</button></p>}
      <details className="service-details">
        <summary>Connection details</summary>
        <div><ConnectivityPanel connectionState={connectionState} onRetry={onRetry} apiBaseUrl={apiBaseUrl} /></div>
      </details>
    </div>
  );
};
