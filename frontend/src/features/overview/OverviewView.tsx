import { useDemoMode } from '../preview/demo-context';
import React, { useEffect, useState } from 'react';
import { Link } from '../../components/workspace-routing';
import { ConnectionState } from '../../types/api';
import { ConnectivityPanel } from './ConnectivityPanel';
import { Card } from '../../components/Card';
import { useBrandApi } from '../../services/useBrandApi';
import { useAuth } from '../auth/auth-context';
import { useTheme } from '../../context/theme-context';
import { ArrowRight, PlusCircle, BookOpen, Sliders, FileText, ChartNoAxesColumn, ShieldCheck, Zap } from 'lucide-react';
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
  const brandApi = useBrandApi();
  const demo = useDemoMode();
  const { isDark } = useTheme();
  const [docCount, setDocCount] = useState<number | null>(null);
  const [ruleCount, setRuleCount] = useState<number | null>(null);
  const [submissions, setSubmissions] = useState<ContentSubmission[] | null>(null);
  const [runs, setRuns] = useState<ValidationRunSummary[] | null>(null);
  const [metricsError, setMetricsError] = useState(false);
  const [loadingMetrics, setLoadingMetrics] = useState(false);
  useEffect(() => {
    let isMounted = true;
    if (session || demo) {
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
  }, [session, demo, brandApi]);

  return (
    <div className="editorial-overview max-w-7xl mx-auto">
      {metricsError && <p role="status" className="overview-note">Some counts could not be loaded. Unavailable values are shown as a dash.</p>}
      <section className="overview-bento" aria-label="Workspace overview">
        <div className="editorial-hero">
          <div className="editorial-hero-copy">
            <p className="editorial-eyebrow">{session?.workspace.name ?? (demo ? 'BrewNest Coffee · Synthetic workspace' : 'Your workspace')}</p>
            <h1>Your brand, <br /><span>in good hands.</span></h1>
            <p>Check your content against your guidelines. See what needs attention before you publish.</p>
            <Link to="/studio" className="hero-cta"><PlusCircle size={18} /> Create a submission <ArrowRight size={16} /></Link>
          </div>
          <div className="editorial-hero-art" aria-hidden="true">
            <img className="editorial-ribbon ribbon-light" src="/images/editorial-print-light.png" alt="" />
            <img className="editorial-ribbon ribbon-dark" src="/images/editorial-shapes-dark.png" alt="" />
            <img className="editorial-portrait" src={isDark ? '/images/editorial-portrait.png' : '/images/editorial-portrait-light.png'} alt="" />
          </div>
        </div>
        <Card className="bento-vault">
          <img className="tile-ribbon ribbon-light" src="/images/editorial-print-light.png" alt="" />
          <img className="tile-ribbon ribbon-dark" src="/images/editorial-shapes-dark.png" alt="" />
          <div className="flex items-center justify-between gap-3"><h2 className="bento-label">Your guidelines</h2><BookOpen size={20} aria-hidden="true" /></div>
          <div className="bento-count">{loadingMetrics ? '—' : (docCount ?? '—')}</div>
          <Link to="/vault" className="bento-link">Upload or manage guidelines <ArrowRight size={15} /></Link>
        </Card>
        <Card className="bento-rules">
          <img className="tile-ribbon ribbon-light" src="/images/editorial-print-light.png" alt="" />
          <img className="tile-ribbon ribbon-dark" src="/images/editorial-shapes-dark.png" alt="" />
          <div className="flex items-center justify-between gap-3"><h2 className="bento-label">Brand rules</h2><Sliders size={20} aria-hidden="true" /></div>
          <div className="bento-count">{loadingMetrics ? '—' : (ruleCount ?? '—')}</div>
          <Link to="/vault" className="bento-link text-brand-700 dark:text-brand-300">Manage terms and phrasing <ArrowRight size={15} /></Link>
        </Card>
        <Card className="bento-recent recent-submissions">
            <img className="tile-ribbon ribbon-light" src="/images/editorial-print-light.png" alt="" />
            <img className="tile-ribbon ribbon-dark" src="/images/editorial-shapes-dark.png" alt="" />
            <h2 className="bento-label"><FileText size={20} aria-hidden="true" /> Recent submissions <span className="text-slate-500 dark:text-slate-400">· {loadingMetrics ? '—' : (submissions?.length ?? '—')}</span></h2>
            <p className="overview-note">Pick up a draft or start something new.</p>
            <Link to="/studio" className="bento-link text-brand-700 dark:text-brand-300">Open Content Studio <ArrowRight size={15} /></Link>
        </Card>
        <Card className="bento-recent recent-checks">
            <img className="tile-ribbon ribbon-light" src="/images/editorial-print-light.png" alt="" />
            <img className="tile-ribbon ribbon-dark" src="/images/editorial-shapes-dark.png" alt="" />
            <h2 className="bento-label"><ChartNoAxesColumn size={20} aria-hidden="true" /> Recent checks <span className="text-slate-500 dark:text-slate-400">· {loadingMetrics ? '—' : (runs?.length ?? '—')}</span></h2>
            <p className="overview-note">Revisit your findings and supporting sources.</p>
            <Link to="/runs" className="bento-link text-brand-700 dark:text-brand-300">View check history <ArrowRight size={15} /></Link>
        </Card>
        <Card className="editorial-banner">
          <img className="banner-ribbon ribbon-light" src="/images/editorial-print-light.png" alt="" />
          <img className="banner-ribbon ribbon-dark" src="/images/editorial-shapes-dark.png" alt="" />
          <div className="editorial-banner-copy">
            <p className="editorial-eyebrow">Ready for your next idea</p>
            <h2>On brand. <span>Backed by evidence.</span></h2>
          </div>
          <div className="editorial-banner-points">
            <span><Zap size={16} aria-hidden="true" /> Check your content</span>
            <span><BookOpen size={16} aria-hidden="true" /> See supporting sources</span>
            <span><ShieldCheck size={16} aria-hidden="true" /> Keep people in control</span>
          </div>
        </Card>
      </section>
      <div className="editorial-utility">
      <p className="overview-note">Missing evidence is marked Needs Verification. Final decisions stay with people.</p>
      {!demo && connectionState.status === 'error' && <p role="status" className="text-sm text-rose-700 dark:text-rose-300">We couldn’t connect. Some actions may be unavailable. <button className="underline font-semibold" onClick={() => void onRetry()}>Try again</button></p>}
      {!demo && <details className="service-details">
        <summary>Connection details</summary>
        <div><ConnectivityPanel connectionState={connectionState} onRetry={onRetry} apiBaseUrl={apiBaseUrl} /></div>
      </details>}
      </div>
    </div>
  );
};
