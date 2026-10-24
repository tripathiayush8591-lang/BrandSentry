import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ConnectionState } from '../../types/api';
import { ConnectivityPanel } from './ConnectivityPanel';
import { Card } from '../../components/Card';
import { brandApi } from '../../services/brand-api';
import { useAuth } from '../auth/auth-context';
import {
  ShieldCheck,
  Layers,
  BookOpen,
  FileCheck2,
  FileText,
  Sliders,
  Sparkles,
  ArrowRight,
  PlusCircle,
  AlertCircle,
  Upload,
} from 'lucide-react';
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
    <div className="space-y-8 max-w-7xl mx-auto">
      {/* Hero / Platform Mission Card (Neumorphic finish) */}
      <div className="overview-hero neu-card p-6 sm:p-8">
        <div className="relative z-10 max-w-3xl space-y-3">
          <div className="text-xs font-semibold uppercase tracking-widest text-brand-700 dark:text-brand-300">
            Your governance workspace
          </div>
          <h1 className="font-display text-3xl sm:text-4xl leading-tight tracking-tight">
            On brand. Backed by evidence.
          </h1>
          <p className="text-sm sm:text-base text-slate-700 dark:text-slate-200 font-medium leading-relaxed">
            Every claim verified. Every decision accountable.
          </p>
          <p className="text-sm text-slate-600 dark:text-slate-300 max-w-2xl leading-relaxed">
            Check your content against approved guidelines and facts. Missing evidence stays <span className="font-semibold">Needs Verification</span>. Final sign-off stays with people.
          </p>
        </div>

      </div>

      {metricsError && <p role="status" className="text-sm text-slate-600 dark:text-slate-300">Some workspace counts could not be loaded. Unavailable values are shown as a dash.</p>}

      {/* 4 Soft Neumorphic KPI Cards (Inspired by the Reference Dashboard) */}
      <section aria-label="Governance metrics overview">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* Card 1: Brand Guidelines */}
          <Card className="p-5 flex flex-col justify-between neu-card-interactive">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                Guidelines Ingested
              </span>
              <div className="w-8 h-8 rounded-xl bg-brand-50 dark:bg-brand-950/60 text-brand-600 dark:text-brand-400 flex items-center justify-center">
                <BookOpen className="w-4 h-4" />
              </div>
            </div>
            <div className="mt-4 flex items-baseline justify-between">
              <span className="text-2xl font-bold text-slate-900 dark:text-white tabular-nums">
                {loadingMetrics ? '—' : (docCount ?? '—')}
              </span>
              <span className="text-[11px] font-medium text-emerald-700 dark:text-emerald-400 flex items-center gap-1">
                Knowledge sources
              </span>
            </div>
            <div className="mt-3 pt-3 border-t border-slate-100 dark:border-slate-800 text-[11px] text-slate-500 dark:text-slate-400 flex items-center justify-between">
              <Link to="/vault" className="hover:text-brand-600 dark:hover:text-brand-400 flex items-center gap-1">
                Manage Vault <ArrowRight className="w-3 h-3" />
              </Link>
            </div>
          </Card>

          {/* Card 2: Deterministic Rules */}
          <Card className="p-5 flex flex-col justify-between neu-card-interactive">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                Brand Rules
              </span>
              <div className="w-8 h-8 rounded-xl bg-brand-50 dark:bg-brand-950/60 text-brand-600 dark:text-brand-400 flex items-center justify-center">
                <Sliders className="w-4 h-4" />
              </div>
            </div>
            <div className="mt-4 flex items-baseline justify-between">
              <span className="text-2xl font-bold text-slate-900 dark:text-white tabular-nums">
                {loadingMetrics ? '—' : (ruleCount ?? '—')}
              </span>
              <span className="text-[11px] font-medium text-brand-600 dark:text-brand-400">
                Configured rules
              </span>
            </div>
            <div className="mt-3 pt-3 border-t border-slate-100 dark:border-slate-800 text-[11px] text-slate-500 dark:text-slate-400 flex items-center justify-between">
              <Link to="/vault" className="hover:text-brand-600 dark:hover:text-brand-400 flex items-center gap-1">
                View Rules <ArrowRight className="w-3 h-3" />
              </Link>
            </div>
          </Card>

          {/* Card 3: Draft Submissions */}
          <Card className="p-5 flex flex-col justify-between neu-card-interactive">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                Recent Submissions
              </span>
              <div className="w-8 h-8 rounded-xl bg-amber-50 dark:bg-amber-950/60 text-amber-700 dark:text-amber-400 flex items-center justify-center">
                <FileText className="w-4 h-4" />
              </div>
            </div>
            <div className="mt-4 flex items-baseline justify-between">
              <span className="text-2xl font-bold text-slate-900 dark:text-white tabular-nums">
                {loadingMetrics ? '—' : (submissions?.length ?? '—')}
              </span>
              <span className="text-[11px] font-medium text-slate-500 dark:text-slate-400">
                Drafts & Revisions
              </span>
            </div>
            <div className="mt-3 pt-3 border-t border-slate-100 dark:border-slate-800 text-[11px] text-slate-500 dark:text-slate-400 flex items-center justify-between">
              <Link to="/studio" className="hover:text-brand-600 dark:hover:text-brand-400 flex items-center gap-1">
                Open Studio <ArrowRight className="w-3 h-3" />
              </Link>
            </div>
          </Card>

          {/* Card 4: Validation Runs */}
          <Card className="p-5 flex flex-col justify-between neu-card-interactive">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                Validation Engine
              </span>
              <div className="w-8 h-8 rounded-xl bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-400 flex items-center justify-center">
                <FileCheck2 className="w-4 h-4" />
              </div>
            </div>
            <div className="mt-4 flex items-baseline justify-between">
              <span className="text-2xl font-bold text-slate-900 dark:text-white tabular-nums">
                {loadingMetrics ? '—' : (runs?.length ?? '—')}
              </span>
              <span className="text-[11px] font-medium text-slate-500 dark:text-slate-400">
                Recent Runs
              </span>
            </div>
            <div className="mt-3 pt-3 border-t border-slate-100 dark:border-slate-800 text-[11px] text-slate-500 dark:text-slate-400 flex items-center justify-between">
              <Link to="/runs" className="hover:text-brand-600 dark:hover:text-brand-400 flex items-center gap-1">
                Run History <ArrowRight className="w-3 h-3" />
              </Link>
            </div>
          </Card>
        </div>
      </section>

      {/* Quick Actions & AI Provider Transparency Banner */}
      <section className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-brand-600 dark:text-brand-400" />
              Quick Governance Actions
            </h2>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <Link
              to="/studio"
              className="p-4 rounded-xl neu-card hover:border-brand-300 dark:hover:border-brand-700 flex flex-col gap-2 group transition-all"
            >
              <div className="w-8 h-8 rounded-lg bg-brand-100 dark:bg-brand-900/40 text-brand-600 dark:text-brand-400 flex items-center justify-center group-hover:scale-105 transition-transform">
                <PlusCircle className="w-4 h-4" />
              </div>
              <span className="text-sm font-semibold text-slate-900 dark:text-white">Draft Submission</span>
              <span className="text-xs text-slate-500 dark:text-slate-400 leading-snug">
                Write or paste marketing copy to validate against brand rules.
              </span>
            </Link>

            <Link
              to="/vault"
              className="p-4 rounded-xl neu-card hover:border-brand-300 dark:hover:border-brand-700 flex flex-col gap-2 group transition-all"
            >
              <div className="w-8 h-8 rounded-lg bg-brand-100 dark:bg-brand-900/40 text-brand-600 dark:text-brand-400 flex items-center justify-center group-hover:scale-105 transition-transform">
                <Upload className="w-4 h-4" />
              </div>
              <span className="text-sm font-semibold text-slate-900 dark:text-white">Upload Guidelines</span>
              <span className="text-xs text-slate-500 dark:text-slate-400 leading-snug">
                Add PDF or text guidelines as evidence for content checks.
              </span>
            </Link>

            <Link
              to="/vault"
              className="p-4 rounded-xl neu-card hover:border-brand-300 dark:hover:border-brand-700 flex flex-col gap-2 group transition-all"
            >
              <div className="w-8 h-8 rounded-lg bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-400 flex items-center justify-center group-hover:scale-105 transition-transform">
                <Sliders className="w-4 h-4" />
              </div>
              <span className="text-sm font-semibold text-slate-900 dark:text-white">Configure Rules</span>
              <span className="text-xs text-slate-500 dark:text-slate-400 leading-snug">
                Set restricted terms, patterns, and preferred phrasing.
              </span>
            </Link>
          </div>
        </div>

        {/* Honest Engine & Provider State Card */}
        <div className="p-4 rounded-xl neu-card bg-slate-50/70 dark:bg-slate-900/50 flex flex-col justify-between gap-3">
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-xs font-semibold text-slate-700 dark:text-slate-300">
              <AlertCircle className="w-4 h-4 text-amber-500" />
              <span>Validation Engine Status</span>
            </div>
            <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
              <strong>Rule checks:</strong> Your configured terms and patterns are checked when you run validation.
            </p>
            <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
              <strong>AI analysis:</strong> Each run records its availability. If AI is unavailable, rule findings remain visible for your review.
            </p>
          </div>

          <div className="text-[11px] text-slate-500 flex items-center gap-1.5 pt-2 border-t border-slate-200 dark:border-slate-800">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
            <span>Workspace: {session?.workspace.name ?? 'Connected'}</span>
          </div>
        </div>
      </section>

      {/* Real FastAPI Backend Connectivity Panel (Keeps exact elements & test-ids) */}
      <section aria-labelledby="connectivity-heading">
        <h2 id="connectivity-heading" className="sr-only">
          Backend Connectivity Status
        </h2>
        <ConnectivityPanel
          connectionState={connectionState}
          onRetry={onRetry}
          apiBaseUrl={apiBaseUrl}
        />
      </section>

      {/* Governance Architecture Pillars */}
      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <Layers className="w-5 h-5 text-brand-600 dark:text-brand-400" aria-hidden="true" />
            Governance Architecture Principles
          </h2>
          <span className="text-xs text-slate-500 dark:text-slate-400">System Design Guarantees</span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card className="p-5 space-y-3">
            <div className="w-9 h-9 rounded-xl bg-brand-50 dark:bg-brand-950/60 text-brand-600 dark:text-brand-400 flex items-center justify-center">
              <ShieldCheck className="w-5 h-5" aria-hidden="true" />
            </div>
            <h3 className="text-sm font-semibold text-slate-900 dark:text-white">
              Evidence-Grounded Findings
            </h3>
            <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
              All claims require direct citations against approved brand guidelines or verified factual registers. The model is barred from inventing citations.
            </p>
          </Card>

          <Card className="p-5 space-y-3">
            <div className="w-9 h-9 rounded-xl bg-brand-50 dark:bg-brand-950/60 text-brand-600 dark:text-brand-400 flex items-center justify-center">
              <FileCheck2 className="w-5 h-5" aria-hidden="true" />
            </div>
            <h3 className="text-sm font-semibold text-slate-900 dark:text-white">
              Immutable Content Revisions
            </h3>
            <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
              Validation runs snapshot exact content hashes and evidence chunk IDs. Edits produce new immutable versions, preserving the audit trail.
            </p>
          </Card>

          <Card className="p-5 space-y-3">
            <div className="w-9 h-9 rounded-xl bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-400 flex items-center justify-center">
              <Sparkles className="w-5 h-5" aria-hidden="true" />
            </div>
            <h3 className="text-sm font-semibold text-slate-900 dark:text-white">
              Deterministic Fallback
            </h3>
            <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
              When AI providers are unavailable, rate-limited, or unconfigured, the deterministic rule engine continues executing without disruption.
            </p>
          </Card>
        </div>
      </section>
    </div>
  );
};
