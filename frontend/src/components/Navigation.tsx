import React from 'react';
import { NavLink } from 'react-router-dom';
import { NAVIGATION_ITEMS } from '../types/navigation';
import {
  LayoutDashboard,
  Archive,
  FileCheck2,
  CheckCircle2,
  BarChart3,
  Lock,
} from 'lucide-react';

const getNavIcon = (id: string) => {
  switch (id) {
    case 'overview':
      return <LayoutDashboard className="w-4 h-4" aria-hidden="true" />;
    case 'brand-vault':
      return <Archive className="w-4 h-4" aria-hidden="true" />;
    case 'content-review':
      return <FileCheck2 className="w-4 h-4" aria-hidden="true" />;
    case 'approvals':
      return <CheckCircle2 className="w-4 h-4" aria-hidden="true" />;
    case 'insights':
      return <BarChart3 className="w-4 h-4" aria-hidden="true" />;
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
  orientation = 'horizontal',
}) => {
  const isHorizontal = orientation === 'horizontal';

  return (
    <nav
      aria-label="Main Navigation"
      className={
        isHorizontal
          ? 'flex items-center gap-1'
          : 'flex flex-col gap-1.5'
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
              title={`${item.label} (Upcoming in ${item.badge ?? 'future phases'})`}
              className={`group flex items-center justify-between gap-2 px-3 py-2 rounded-lg text-sm font-medium text-slate-400 bg-transparent cursor-not-allowed select-none ${
                isHorizontal ? 'opacity-75 hover:opacity-100' : ''
              }`}
            >
              <div className="flex items-center gap-2">
                <span className="text-slate-400">{icon}</span>
                <span>{item.label}</span>
              </div>
              <span className="inline-flex items-center gap-1 text-[11px] font-semibold tracking-wide uppercase px-1.5 py-0.5 rounded bg-slate-100 text-slate-500 border border-slate-200">
                <Lock className="w-2.5 h-2.5" aria-hidden="true" />
                {item.badge}
              </span>
            </div>
          );
        }

        return (
          <NavLink
            key={item.id}
            to={item.href}
            onClick={onItemClick}
            end
            className={({ isActive }) =>
              `flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                isActive
                  ? 'bg-slate-900 text-white shadow-sm'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
              }`
            }
          >
            {icon}
            <span>{item.label}</span>
          </NavLink>
        );
      })}
    </nav>
  );
};
