import React from 'react';
import { ConnectionState } from '../../types/api';
import { ConnectivityPanel } from './ConnectivityPanel';
import { Card } from '../../components/Card';
import {
  ShieldCheck,
  CheckCircle,
  Clock,
  Layers,
  Database,
  Users,
  Compass,
} from 'lucide-react';

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
  return (
    <div className="space-y-8 max-w-7xl mx-auto">
      {/* Hero / Platform Mission */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-slate-900 via-slate-850 to-slate-950 text-white p-8 sm:p-10 shadow-lg border border-slate-800">
        <div className="relative z-10 max-w-3xl space-y-4">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
            <span className="w-2 h-2 rounded-full bg-emerald-400" />
            Phase 1B: Frontend & API Integration Foundation
          </div>
          <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight">
            AI-Assisted Pre-Publication Brand Governance
          </h1>
          <p className="text-base sm:text-lg text-slate-300 font-medium leading-relaxed">
            Every claim verified. Every decision accountable.
          </p>
          <p className="text-sm text-slate-400 max-w-2xl leading-normal">
            BrandSentry checks marketing and communication materials against approved brand guidelines, facts, and assets. Missing evidence triggers <span className="text-amber-300 font-semibold">Needs Verification</span> rather than ungrounded assumptions, leaving final sign-off in human hands.
          </p>
        </div>

        {/* Decorative background accent */}
        <div className="absolute -right-10 -bottom-10 w-80 h-80 rounded-full bg-emerald-500/5 blur-3xl pointer-events-none" />
      </div>

      {/* Real FastAPI Backend Connectivity Panel */}
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
          <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2">
            <Layers className="w-5 h-5 text-emerald-600" aria-hidden="true" />
            Governance Architecture Principles
          </h2>
          <span className="text-xs text-slate-500">System Design Guarantees</span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card className="p-5 space-y-3">
            <div className="w-9 h-9 rounded-lg bg-emerald-50 text-emerald-700 flex items-center justify-center">
              <ShieldCheck className="w-5 h-5 text-emerald-600" aria-hidden="true" />
            </div>
            <h3 className="text-sm font-semibold text-slate-900">
              Evidence-Grounded Findings
            </h3>
            <p className="text-xs text-slate-600 leading-relaxed">
              Every identified violation or suggestion links directly to an approved guideline version or canonical fact. Unverifiable claims are flagged for verification rather than hallucinated.
            </p>
          </Card>

          <Card className="p-5 space-y-3">
            <div className="w-9 h-9 rounded-lg bg-blue-50 text-blue-700 flex items-center justify-center">
              <Users className="w-5 h-5 text-blue-600" aria-hidden="true" />
            </div>
            <h3 className="text-sm font-semibold text-slate-900">
              Human-Controlled Authority
            </h3>
            <p className="text-xs text-slate-600 leading-relaxed">
              AI provides automated pre-checks and suggested corrections, but cannot approve content autonomously. Sign-off remains with authorised human reviewers.
            </p>
          </Card>

          <Card className="p-5 space-y-3">
            <div className="w-9 h-9 rounded-lg bg-indigo-50 text-indigo-700 flex items-center justify-center">
              <Database className="w-5 h-5 text-indigo-600" aria-hidden="true" />
            </div>
            <h3 className="text-sm font-semibold text-slate-900">
              Immutable Audit & Revisions
            </h3>
            <p className="text-xs text-slate-600 leading-relaxed">
              Submissions, revisions, validations, and review decisions are permanently versioned in SQLite with atomic audit event logs for regulatory compliance.
            </p>
          </Card>
        </div>
      </section>

      {/* Phased Roadmap & Destination Preview */}
      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2">
            <Compass className="w-5 h-5 text-emerald-600" aria-hidden="true" />
            Implementation Roadmap Status
          </h2>
          <span className="text-xs text-slate-500">Staged Delivery Gate</span>
        </div>

        <Card className="p-6">
          <div className="divide-y divide-slate-100">
            {/* Phase 1 */}
            <div className="py-4 first:pt-0 flex items-start gap-3">
              <div className="mt-0.5">
                <CheckCircle className="w-5 h-5 text-emerald-600" aria-hidden="true" />
              </div>
              <div className="space-y-1 flex-1">
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <span className="text-sm font-semibold text-slate-900">
                    Phase 1: Foundation (Backend 1A & Frontend 1B)
                  </span>
                  <span className="text-xs font-semibold px-2 py-0.5 rounded bg-emerald-100 text-emerald-800">
                    Current Milestone
                  </span>
                </div>
                <p className="text-xs text-slate-600">
                  FastAPI service factory, health/readiness, CORS, request IDs, typed API client, accessible application shell, and verified localhost HTTP connectivity.
                </p>
              </div>
            </div>

            {/* Phase 2 */}
            <div className="py-4 flex items-start gap-3 opacity-80">
              <div className="mt-0.5">
                <Clock className="w-5 h-5 text-slate-400" aria-hidden="true" />
              </div>
              <div className="space-y-1 flex-1">
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <span className="text-sm font-semibold text-slate-700">
                    Phase 2: Identity & Session Management
                  </span>
                  <span className="text-xs font-medium px-2 py-0.5 rounded bg-slate-100 text-slate-600">
                    Upcoming
                  </span>
                </div>
                <p className="text-xs text-slate-500">
                  Google sign-in via Firebase Authentication, isolated demo guest sessions, role authorization, and persistent session tokens.
                </p>
              </div>
            </div>

            {/* Phase 3 */}
            <div className="py-4 flex items-start gap-3 opacity-80">
              <div className="mt-0.5">
                <Clock className="w-5 h-5 text-slate-400" aria-hidden="true" />
              </div>
              <div className="space-y-1 flex-1">
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <span className="text-sm font-semibold text-slate-700">
                    Phase 3: Brand Knowledge Vault & Content Submission
                  </span>
                  <span className="text-xs font-medium px-2 py-0.5 rounded bg-slate-100 text-slate-600">
                    Upcoming
                  </span>
                </div>
                <p className="text-xs text-slate-500">
                  Guideline CRUD, versioning, rule indexing, content draft submissions, and deterministic rule evaluation.
                </p>
              </div>
            </div>

            {/* Phase 4 & 5 */}
            <div className="py-4 last:pb-0 flex items-start gap-3 opacity-80">
              <div className="mt-0.5">
                <Clock className="w-5 h-5 text-slate-400" aria-hidden="true" />
              </div>
              <div className="space-y-1 flex-1">
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <span className="text-sm font-semibold text-slate-700">
                    Phases 4 & 5: AI Validation, Human Review & Deployment
                  </span>
                  <span className="text-xs font-medium px-2 py-0.5 rounded bg-slate-100 text-slate-600">
                    Upcoming
                  </span>
                </div>
                <p className="text-xs text-slate-500">
                  Gemini semantic validation adapter, evidence verifier, reviewer queue with approval workflow, live insights, and Railway/Vercel production release.
                </p>
              </div>
            </div>
          </div>
        </Card>
      </section>
    </div>
  );
};
