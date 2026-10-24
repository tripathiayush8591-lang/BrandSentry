import React, { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Menu, X, Search } from 'lucide-react';
import { Navigation } from './Navigation';
import { StatusBadge } from './StatusBadge';
import { ThemeToggle } from './ThemeToggle';
import { ConnectionState } from '../types/api';

interface HeaderProps {
  connectionState: ConnectionState;
  onOpenMobileSidebar?: () => void;
}

export const Header: React.FC<HeaderProps> = ({ connectionState }) => {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const navigate = useNavigate();
  const menuButton = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!mobileMenuOpen) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setMobileMenuOpen(false);
        menuButton.current?.focus();
      }
    };
    document.addEventListener('keydown', closeOnEscape);
    return () => document.removeEventListener('keydown', closeOnEscape);
  }, [mobileMenuOpen]);

  const toggleMobileMenu = () => setMobileMenuOpen((prev) => !prev);
  const closeMobileMenu = () => setMobileMenuOpen(false);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (searchQuery.trim()) {
      navigate(`/vault?search=${encodeURIComponent(searchQuery.trim())}`);
    }
  };

  return (
    <header className="workspace-header sticky top-0 z-30 border-b border-slate-200/80 dark:border-slate-800/80">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16 gap-4">
          {/* Left: Mobile hamburger & Brand */}
          <div className="flex items-center gap-3">
            <button
              type="button"
              ref={menuButton}
              onClick={toggleMobileMenu}
              aria-label="Toggle navigation menu"
              aria-expanded={mobileMenuOpen}
              aria-controls="mobile-menu"
              className="md:hidden inline-flex items-center justify-center p-2 rounded-xl text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white hover:bg-slate-200/60 dark:hover:bg-slate-800/60 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
            >
              {mobileMenuOpen ? (
                <X className="w-5 h-5" aria-hidden="true" />
              ) : (
                <Menu className="w-5 h-5" aria-hidden="true" />
              )}
            </button>

            <Link
              to="/"
              className="flex items-center gap-2 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 rounded-xl p-1"
              aria-label="BrandSentry home"
            >
              <img src="/images/brandsentry-icon.png" className="brand-icon" alt="" />
              <div className="flex items-center gap-1.5">
                <span className="brand-wordmark font-display tracking-tight text-slate-900 dark:text-white">
                  Brand<span className="text-brand-600 dark:text-brand-400">Sentry</span>
                </span>
              </div>
            </Link>
          </div>

          {/* Center: Inset Search Bar (matches neumorphic reference) */}
          <div className="hidden sm:flex flex-1 max-w-md mx-2">
            <form onSubmit={handleSearchSubmit} className="w-full relative">
              <label htmlFor="global-search" className="sr-only">
                Search knowledge, rules or submissions
              </label>
              <div className="relative flex items-center">
                <Search className="w-4 h-4 text-slate-500 absolute left-3 pointer-events-none" aria-hidden="true" />
                <input
                  id="global-search"
                  type="search"
                  placeholder="Search guidelines, rules, or claims..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-9 pr-4 py-1.5 text-xs rounded-xl neu-input bg-slate-100/70 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-700/80 text-slate-900 dark:text-slate-100 placeholder-slate-400 focus:outline-none focus:border-brand-500"
                />
              </div>
            </form>
          </div>

          {/* Right: Theme Toggle & Backend Status */}
          <div className="flex items-center gap-2.5">
            <ThemeToggle />
            <div className="hidden xs:block">
              <StatusBadge state={connectionState} />
            </div>
          </div>
        </div>
      </div>

      {/* Mobile Menu Dropdown */}
      {mobileMenuOpen && (
        <div
          id="mobile-menu"
          data-testid="mobile-menu"
          className="md:hidden border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-neu-surface-dark px-4 pt-3 pb-5 space-y-4 shadow-lg animate-in slide-in-from-top-2"
        >
          <div className="sm:hidden pb-2 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
            <span className="text-xs font-medium text-slate-500 dark:text-slate-400">Connection:</span>
            <StatusBadge state={connectionState} />
          </div>
          <div>
            <div className="text-xs font-semibold text-slate-500 uppercase tracking-wider px-3 mb-2">
              Navigation
            </div>
            <Navigation orientation="vertical" onItemClick={closeMobileMenu} />
          </div>
        </div>
      )}
    </header>
  );
};
