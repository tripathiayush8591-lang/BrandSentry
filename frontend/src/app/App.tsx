import React, { useState } from 'react';
import { Routes, Route, Outlet, useOutletContext } from 'react-router-dom';
import { Header } from '../components/Header';
import { Sidebar } from '../components/Sidebar';
import { OverviewView } from '../features/overview/OverviewView';
import { BrandVaultView } from '../features/vault/BrandVaultView';
import { ContentStudioView } from '../features/studio/ContentStudioView';
import { ValidationRunsView } from '../features/runs/ValidationRunsView';
import { EvidenceFindingsView } from '../features/runs/EvidenceFindingsView';
import { InsightsView } from '../features/insights/InsightsView';
import { NotFoundView } from '../features/not-found/NotFoundView';
import { useBackendStatus } from '../hooks/useBackendStatus';
import { AuthProvider } from '../features/auth/AuthProvider';
import { LoginPage } from '../features/auth/LoginPage';
import { ProtectedRoute } from '../features/auth/ProtectedRoute';
import { SessionProfile } from '../features/auth/SessionProfile';
import { ThemeProvider } from '../context/ThemeProvider';
import { PreviewPage } from '../features/preview/PreviewPage';
import { useDemoMode } from '../features/preview/demo-context';
import { Link } from 'react-router-dom';

const ApplicationShell: React.FC = () => {
  const demo = useDemoMode();
  const { connectionState, checkConnection, apiBaseUrl } = useBackendStatus(5000, !demo);
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);

  React.useEffect(() => {
    document.title = demo ? 'Guest Demo · BrandSentry' : 'Workspace · BrandSentry';
  }, [demo]);

  return (
    <div className="product-workspace min-h-screen flex flex-col bg-neu-canvas-light dark:bg-neu-canvas-dark text-slate-900 dark:text-slate-100 font-sans selection:bg-brand-100 dark:selection:bg-brand-900/50 selection:text-brand-900 dark:selection:text-brand-100 transition-colors duration-150">
      {/* Skip to Main Content Link for Keyboard Accessibility */}
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:absolute focus:top-3 focus:left-3 z-50 px-4 py-2 bg-brand-600 text-white rounded-lg shadow-lg font-medium text-xs outline-none"
      >
        Skip to main content
      </a>

      {/* Global Application Header */}
      <Header
        connectionState={connectionState}
        onOpenMobileSidebar={() => setMobileSidebarOpen(true)}
      />

      {/* Session Profile Bar (Preserved for Phase 2B integration & tests) */}
      {demo ? <section className="session-profile" aria-label="Demo mode disclosure">
        <div className="session-profile-inner flex-wrap">
          <strong>Guest Demo — Synthetic Data</strong>
          <span>BrewNest Coffee · Simulated validation, evidence and review records.</span>
          <Link to="/login" className="session-logout">Exit demo</Link>
        </div>
        <p className="session-limit px-4 pb-3">Available in connected mode: uploads, live Gemini, saving and real approvals. This preview sends no API requests and saves no records.</p>
      </section> : <SessionProfile />}

      {/* Main Body with Persistent Responsive Sidebar */}
      <div className="workspace-body flex-1 flex w-full mx-auto">
        {/* Desktop Sidebar (visible on md+) */}
        <div className="hidden md:block w-64 flex-shrink-0">
          <Sidebar />
        </div>

        {/* Mobile Sidebar Off-canvas Drawer */}
        {mobileSidebarOpen && (
          <div className="fixed inset-0 z-50 md:hidden flex">
            <div
              className="fixed inset-0 bg-slate-950/60 backdrop-blur-xs transition-opacity"
              onClick={() => setMobileSidebarOpen(false)}
              aria-hidden="true"
            />
            <div className="relative flex-1 flex flex-col max-w-xs w-full bg-white dark:bg-neu-surface-dark shadow-2xl z-10">
              <Sidebar onCloseMobile={() => setMobileSidebarOpen(false)} />
            </div>
          </div>
        )}

        {/* Dynamic Route Content Area */}
        <main id="main-content" className="flex-1 min-w-0 py-6 px-4 sm:px-6 lg:px-8 overflow-x-hidden">
          <Outlet context={{ connectionState, checkConnection, apiBaseUrl }} />
        </main>
      </div>

      {/* Application Shell Footer */}
      <footer className="workspace-footer border-t border-slate-200/80 dark:border-slate-800/80 py-6 mt-auto">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-slate-500 dark:text-slate-400">
          <div>
            <span className="font-semibold text-slate-700 dark:text-slate-200">BrandSentry</span>
          </div>
          <div className="flex items-center gap-4 text-slate-500 dark:text-slate-400">
            <span>PROMPT PIRATES</span>
            <span>•</span>
            <span>Thoughtful checks. Human decisions.</span>
          </div>
        </div>
      </footer>
    </div>
  );
};

// Preserve the connected overview with outlet context
function ConnectedOverview() {
  const { connectionState, checkConnection, apiBaseUrl } =
    useOutletContext<ReturnType<typeof useBackendStatus>>();
  return (
    <OverviewView
      connectionState={connectionState}
      onRetry={checkConnection}
      apiBaseUrl={apiBaseUrl}
    />
  );
}

export const App: React.FC = () => (
  <ThemeProvider>
      <Routes>
        <Route path="/preview" element={<PreviewPage />}>
          <Route element={<ApplicationShell />}>
            <Route index element={<ConnectedOverview />} />
            <Route path="vault" element={<BrandVaultView />} />
            <Route path="studio" element={<ContentStudioView />} />
            <Route path="studio/:submissionId" element={<ContentStudioView />} />
            <Route path="runs" element={<ValidationRunsView />} />
            <Route path="runs/:runId" element={<EvidenceFindingsView />} />
            <Route path="findings" element={<EvidenceFindingsView sampleRunId="brewnest-run-1" />} />
            <Route path="review" element={<EvidenceFindingsView sampleRunId="brewnest-run-1" />} />
            <Route path="insights" element={<InsightsView />} />
            <Route path="*" element={<NotFoundView />} />
          </Route>
        </Route>
        <Route element={<AuthProvider><Outlet /></AuthProvider>}>
        <Route path="/login" element={<LoginPage />} />
        <Route element={<ProtectedRoute />}>
          <Route element={<ApplicationShell />}>
            <Route path="/" element={<ConnectedOverview />} />
            <Route path="/vault" element={<BrandVaultView />} />
            <Route path="/studio" element={<ContentStudioView />} />
            <Route path="/studio/:submissionId" element={<ContentStudioView />} />
            <Route path="/runs" element={<ValidationRunsView />} />
            <Route path="/insights" element={<InsightsView />} />
            <Route path="/runs/:runId" element={<EvidenceFindingsView />} />
            <Route path="*" element={<NotFoundView />} />
          </Route>
        </Route>
        </Route>
      </Routes>
  </ThemeProvider>
);

export default App;
