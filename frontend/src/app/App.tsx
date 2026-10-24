import React, { useState } from 'react';
import { Routes, Route, Outlet, useOutletContext } from 'react-router-dom';
import { Header } from '../components/Header';
import { Sidebar } from '../components/Sidebar';
import { OverviewView } from '../features/overview/OverviewView';
import { BrandVaultView } from '../features/vault/BrandVaultView';
import { ContentStudioView } from '../features/studio/ContentStudioView';
import { ValidationRunsView } from '../features/runs/ValidationRunsView';
import { EvidenceFindingsView } from '../features/runs/EvidenceFindingsView';
import { NotFoundView } from '../features/not-found/NotFoundView';
import { useBackendStatus } from '../hooks/useBackendStatus';
import { AuthProvider } from '../features/auth/AuthProvider';
import { LoginPage } from '../features/auth/LoginPage';
import { ProtectedRoute } from '../features/auth/ProtectedRoute';
import { SessionProfile } from '../features/auth/SessionProfile';
import { ThemeProvider } from '../context/ThemeProvider';

const ApplicationShell: React.FC = () => {
  const { connectionState, checkConnection, apiBaseUrl } = useBackendStatus();
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);

  React.useEffect(() => {
    document.title = 'Workspace · BrandSentry';
  }, []);

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
      <SessionProfile />

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
    <AuthProvider>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route element={<ProtectedRoute />}>
          <Route element={<ApplicationShell />}>
            <Route path="/" element={<ConnectedOverview />} />
            <Route path="/vault" element={<BrandVaultView />} />
            <Route path="/studio" element={<ContentStudioView />} />
            <Route path="/studio/:submissionId" element={<ContentStudioView />} />
            <Route path="/runs" element={<ValidationRunsView />} />
            <Route path="/runs/:runId" element={<EvidenceFindingsView />} />
            <Route path="*" element={<NotFoundView />} />
          </Route>
        </Route>
      </Routes>
    </AuthProvider>
  </ThemeProvider>
);

export default App;
