import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { ShieldCheck, Menu, X } from 'lucide-react';
import { Navigation } from './Navigation';
import { StatusBadge } from './StatusBadge';
import { ConnectionState } from '../types/api';

interface HeaderProps {
  connectionState: ConnectionState;
}

export const Header: React.FC<HeaderProps> = ({ connectionState }) => {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const toggleMobileMenu = () => setMobileMenuOpen((prev) => !prev);
  const closeMobileMenu = () => setMobileMenuOpen(false);

  return (
    <header className="sticky top-0 z-40 bg-white/95 backdrop-blur-md border-b border-slate-200">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          {/* Brand Wordmark & Logo */}
          <div className="flex items-center gap-6">
            <Link
              to="/"
              className="flex items-center gap-2.5 focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-900 rounded-lg p-1"
              aria-label="BrandSentry home"
            >
              <div className="w-9 h-9 rounded-lg bg-slate-900 text-brand-400 flex items-center justify-center shadow-sm">
                <ShieldCheck className="w-5 h-5 text-emerald-400" aria-hidden="true" />
              </div>
              <div>
                <span className="text-lg font-bold tracking-tight text-slate-900">
                  Brand<span className="text-emerald-600">Sentry</span>
                </span>
                <span className="hidden sm:inline-block ml-2 text-[10px] font-semibold uppercase tracking-wider text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded border border-slate-200">
                  Foundation
                </span>
              </div>
            </Link>

            {/* Desktop Navigation */}
            <div className="hidden md:block">
              <Navigation orientation="horizontal" />
            </div>
          </div>

          {/* Right Header: Status Badge & Mobile Hamburger */}
          <div className="flex items-center gap-3">
            <div className="hidden sm:block">
              <StatusBadge state={connectionState} />
            </div>

            {/* Mobile Hamburger Toggle */}
            <button
              type="button"
              onClick={toggleMobileMenu}
              aria-label="Toggle navigation menu"
              aria-expanded={mobileMenuOpen}
              aria-controls="mobile-menu"
              className="md:hidden inline-flex items-center justify-center p-2 rounded-lg text-slate-600 hover:text-slate-900 hover:bg-slate-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-900"
            >
              {mobileMenuOpen ? (
                <X className="w-6 h-6" aria-hidden="true" />
              ) : (
                <Menu className="w-6 h-6" aria-hidden="true" />
              )}
            </button>
          </div>
        </div>
      </div>

      {/* Mobile Menu Dropdown */}
      {mobileMenuOpen && (
        <div
          id="mobile-menu"
          data-testid="mobile-menu"
          className="md:hidden border-b border-slate-200 bg-white px-4 pt-3 pb-5 space-y-4 shadow-lg animate-in slide-in-from-top-2"
        >
          <div className="sm:hidden pb-2 border-b border-slate-100 flex items-center justify-between">
            <span className="text-xs font-medium text-slate-500">System Status:</span>
            <StatusBadge state={connectionState} />
          </div>
          <div>
            <div className="text-xs font-semibold text-slate-400 uppercase tracking-wider px-3 mb-2">
              Navigation
            </div>
            <Navigation orientation="vertical" onItemClick={closeMobileMenu} />
          </div>
        </div>
      )}
    </header>
  );
};
