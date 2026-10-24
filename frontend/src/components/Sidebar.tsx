import React from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { PlusCircle, LogOut, X, Sparkles } from 'lucide-react';
import { Navigation } from './Navigation';
import { useAuth } from '../features/auth/auth-context';

interface SidebarProps {
  onCloseMobile?: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({ onCloseMobile }) => {
  const { session, logout, pending } = useAuth();
  const navigate = useNavigate();

  const isGuest = session?.user.kind === 'guest';
  const role = session?.role ?? 'creator';

  const handleNewSubmission = () => {
    if (onCloseMobile) onCloseMobile();
    navigate('/studio');
  };

  return (
    <aside
      className="workspace-sidebar w-64 h-full flex flex-col justify-between p-4 border-r border-slate-200/80 dark:border-slate-800/80 select-none overflow-y-auto"
      aria-label="Sidebar navigation"
    >
      {/* Top Header / Brand */}
      <div className="flex flex-col gap-6">
        <div className="flex items-center justify-between px-2 pt-1">
          <Link
            to="/"
            onClick={onCloseMobile}
            className="flex items-center gap-2.5 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 rounded-xl"
            aria-label="BrandSentry workspace navigation"
          >
            <img src="/images/brandsentry-icon.png" className="brand-icon" alt="" />
            <div className="flex flex-col">
              <span className="brand-wordmark font-display text-base tracking-tight text-slate-900 dark:text-white leading-tight">
                Brand<span className="text-brand-600 dark:text-brand-400">Sentry</span>
              </span>
            </div>
          </Link>

          {/* Close drawer button for mobile */}
          {onCloseMobile && (
            <button
              type="button"
              onClick={onCloseMobile}
              className="md:hidden p-1.5 rounded-lg text-slate-500 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-200/50 dark:hover:bg-slate-800"
              aria-label="Close navigation sidebar"
            >
              <X className="w-5 h-5" />
            </button>
          )}
        </div>

        {/* Quick Action: New Submission */}
        <div className="px-1">
          <button
            type="button"
            onClick={handleNewSubmission}
            className="w-full flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl neu-btn-primary text-sm shadow-md"
          >
            <PlusCircle className="w-4 h-4" />
            <span>New Submission</span>
          </button>
        </div>

        {/* Navigation Section */}
        <div className="flex flex-col gap-1.5">
          <div className="px-3 text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
            Workspace
          </div>
          <Navigation orientation="vertical" onItemClick={onCloseMobile} />
        </div>
      </div>

      {/* Bottom Profile & Workspace Info */}
      <div className="mt-8 pt-4 border-t border-slate-200/60 dark:border-slate-800/60 flex flex-col gap-3">
        <div className="neu-card-sm p-3 flex flex-col gap-2 bg-white/70 dark:bg-slate-900/60">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-700 dark:text-slate-200 truncate">
              {session?.workspace.name ?? 'Workspace'}
            </span>
            <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 border border-slate-200/60 dark:border-slate-700/60 capitalize">
              {role}
            </span>
          </div>

          <div className="flex items-center gap-1.5 text-[11px] text-slate-500 dark:text-slate-400">
            {isGuest ? (
              <span className="inline-flex items-center gap-1 text-amber-700 dark:text-amber-400">
                <Sparkles className="w-3 h-3" /> Demo Sandbox
              </span>
            ) : (
              <span className="truncate">{session?.user.email ?? session?.user.display_name}</span>
            )}
          </div>
        </div>

        <button
          type="button"
          onClick={() => void logout()}
          disabled={pending === 'logout'}
          aria-label="Log out of workspace"
          className="w-full flex items-center justify-center gap-2 py-2 px-3 rounded-xl text-xs font-medium text-slate-600 dark:text-slate-400 hover:text-rose-600 dark:hover:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/30 transition-colors border border-transparent hover:border-rose-200 dark:hover:border-rose-900/40"
        >
          <LogOut className="w-3.5 h-3.5" />
          <span>{pending === 'logout' ? 'Signing out...' : 'Log out of workspace'}</span>
        </button>
      </div>
    </aside>
  );
};
