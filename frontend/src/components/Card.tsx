import React from 'react';

interface CardProps {
  children: React.ReactNode;
  className?: string;
}

export const Card: React.FC<CardProps> = ({ children, className = '' }) => {
  return (
    <div
      className={`bg-white rounded-xl border border-slate-200/80 shadow-sm transition-all ${className}`}
    >
      {children}
    </div>
  );
};
