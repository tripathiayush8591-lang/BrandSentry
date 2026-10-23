import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Card } from '../../components/Card';
import { FileQuestion, ArrowLeft } from 'lucide-react';

export const NotFoundView: React.FC = () => {
  const location = useLocation();

  return (
    <div className="py-16 max-w-xl mx-auto px-4 text-center">
      <Card className="p-8 space-y-5">
        <div className="w-14 h-14 rounded-full bg-slate-100 text-slate-500 mx-auto flex items-center justify-center">
          <FileQuestion className="w-7 h-7" aria-hidden="true" />
        </div>
        <div className="space-y-2">
          <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">
            Error 404
          </span>
          <h1 className="text-xl font-bold text-slate-900">
            Page Not Found
          </h1>
          <p className="text-sm text-slate-600">
            The requested path <code className="bg-slate-100 px-1.5 py-0.5 rounded font-mono text-slate-800 text-xs">{location.pathname}</code> does not exist or has not been implemented yet.
          </p>
        </div>
        <div className="pt-2">
          <Link
            to="/"
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium bg-slate-900 text-white hover:bg-slate-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-900 shadow-sm transition-colors"
          >
            <ArrowLeft className="w-4 h-4" aria-hidden="true" />
            Return to Overview
          </Link>
        </div>
      </Card>
    </div>
  );
};
