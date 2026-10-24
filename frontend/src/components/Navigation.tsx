import React from 'react';
import { NavLink } from 'react-router-dom';
import { NAVIGATION_ITEMS } from '../types/navigation';
import {
  LayoutDashboard,
  Archive,
  FileEdit,
  ShieldCheck,
  CheckCircle2,
  BarChart3,
  Lock,
} from 'lucide-react';

const getNavIcon = (id: string) => {
  switch (id) {
    case 'overview':
      return <LayoutDashboard className="w-4 h-4 flex-shrink-0" aria-hidden="true" />;
    case 'brand-vault':
      return <Archive className="w-4 h-4 flex-shrink-0" aria-hidden="true" />;
    case 'content-studio':
      return <FileEdit className="w-4 h-4 flex-shrink-0" aria-hidden="true" />;
    case 'validation-runs':
      return <ShieldCheck className="w-4 h-4 flex-shrink-0" aria-hidden="true" />;
    case 'approvals':
      return <CheckCircle2 className="w-4 h-4 flex-shrink-0" aria-hidden="true" />;
    case 'insights':
      return <BarChart3 className="w-4 h-4 flex-shrink-0" aria-hidden="true" />;
    default:
      return null;
  }
};

interface NavigationProps {
  onItemClick?: () => void;
  orientation?: 'horizontal' | 'vertical';
}

export const Navigation: React.FC<NavigationProps> = ({
  onItemClick,
  orientation = 'vertical',
}) => {
  const isHorizontal = orientation === 'horizontal';

  return (
    <nav
      aria-label="Main Navigation"
      className={
        isHorizontal
          ? 'flex items-center gap-1.5'
          : 'flex flex-col gap-1.5 w-full'
      }
    >
      {NAVIGATION_ITEMS.map((item) => {
        const isUpcoming = item.status === 'upcoming';
        const icon = getNavIcon(item.id);

        if (isUpcoming) {
          return (
            <div
              key={item.id}
              role="link"
              aria-disabled="true"
              title={`${item.label} (Coming soon)`}
              className={`flex items-center justify-between gap-2.5 px-3 py-2.5 rounded-xl text-xs font-medium text-slate-500 dark:text-slate-400 bg-transparent cursor-not-allowed select-none ${
                isHorizontal ? 'opacity-70' : 'w-full'
              }`}
            >
              <div className="flex items-center gap-2.5 truncate">
                <span>{icon}</span>
                <span className="truncate">{item.label}</span>
              </div>
              <span className="inline-flex items-center gap-1 text-[10px] font-semibold tracking-wider uppercase px-1.5 py-0.5 rounded-md bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 border border-slate-200 dark:border-slate-700">
                <Lock className="w-2.5 h-2.5" aria-hidden="true" />
                Soon
              </span>
            </div>
          );
        }

        return (
          <NavLink
            key={item.id}
            to={item.href}
            onClick={onItemClick}
            end={item.href === '/'}
            className={({ isActive }) =>
              `flex items-center gap-2.5 px-3.5 py-2.5 rounded-xl text-sm font-medium transition-all ${
                isActive
                  ? 'bg-brand-50 dark:bg-brand-950/40 text-brand-600 dark:text-brand-400 font-semibold shadow-sm border border-brand-200/60 dark:border-brand-800/60'
                  : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100/80 dark:hover:bg-slate-800/50'
              }`
            }
          >
            <span className="text-current">{icon}</span>
            <span className="truncate">{item.label}</span>
          </NavLink>
        );
      })}
    </nav>
  );
};
