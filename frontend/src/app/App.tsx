import React from 'react';
import { Routes, Route } from 'react-router-dom';
import { Header } from '../components/Header';
import { OverviewView } from '../features/overview/OverviewView';
import { NotFoundView } from '../features/not-found/NotFoundView';
import { useBackendStatus } from '../hooks/useBackendStatus';

export const App: React.FC = () => {
  const { connectionState, checkConnection, apiBaseUrl } = useBackendStatus();

  return (
    <div className="min-h-screen flex flex-col bg-slate-50 text-slate-900 font-sans selection:bg-emerald-100 selection:text-emerald-900">
      {/* Skip to Main Content Link for Keyboard Accessibility */}
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:absolute focus:top-3 focus:left-3 z-50 px-4 py-2 bg-slate-900 text-white rounded-lg shadow-lg font-medium text-xs outline-none"
      >
        Skip to main content
      </a>

      {/* Global Application Header */}
      <Header connectionState={connectionState} />

      {/* Main Content Area */}
      <main id="main-content" className="flex-1 py-8 px-4 sm:px-6 lg:px-8">
        <Routes>
          <Route
            path="/"
            element={
              <OverviewView
                connectionState={connectionState}
                onRetry={checkConnection}
                apiBaseUrl={apiBaseUrl}
              />
            }
          />
          <Route path="*" element={<NotFoundView />} />
        </Routes>
      </main>

      {/* Application Shell Footer */}
      <footer className="border-t border-slate-200 bg-white py-6">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-slate-500">
          <div>
            <span className="font-semibold text-slate-700">BrandSentry</span> — AI-assisted pre-publication brand governance.
          </div>
          <div className="flex items-center gap-4 text-slate-400">
            <span>PROMPT PIRATES</span>
            <span>•</span>
            <span>Phase 1B: Foundation</span>
          </div>
        </div>
      </footer>
    </div>
  );
};

export default App;
