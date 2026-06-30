
import React from 'react';

interface GlassCardProps {
  children: React.ReactNode;
  className?: string;
  onClick?: () => void;
}

export const GlassCard: React.FC<GlassCardProps> = ({ children, className = '', onClick }) => {
  return (
    <div 
      onClick={onClick}
      className={`
        bg-surface
        border border-white/5
        shadow-card
        rounded-3xl p-6 
        ${className}
      `}
    >
      {children}
    </div>
  );
};
