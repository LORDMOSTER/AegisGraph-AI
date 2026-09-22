import React from 'react';

// The AegisGraph "A" logo mark (Mark only)
export const LogoMark: React.FC<{ className?: string; style?: React.CSSProperties }> = ({ className = '', style = {} }) => (
  <svg viewBox="0 0 100 100" fill="none" stroke="currentColor" strokeWidth="4" className={className} style={style} xmlns="http://www.w3.org/2000/svg">
    <path d="M50 20 L25 80 M50 20 L75 80 M35 60 L65 60" strokeLinecap="round" strokeLinejoin="round"/>
    <path d="M75 35 A 30 30 0 1 0 75 75 L75 55 L55 55" strokeLinecap="round" strokeLinejoin="round"/>
  </svg>
);

// Full lockup (Mark + "AegisGraph AI" Wordmark)
export const LogoLockup: React.FC<{ className?: string; style?: React.CSSProperties }> = ({ className = '', style = {} }) => (
  <div className={`flex flex-col items-center ${className}`} style={{ ...style, display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
    <LogoMark style={{ width: '4rem', height: '4rem', marginBottom: '0.5rem', color: 'var(--brand-accent)' }} />
    <span style={{ fontWeight: 'bold', fontSize: '1.25rem', letterSpacing: '0.025em', color: 'var(--brand-accent)', fontFamily: 'var(--font-display)' }}>
      AegisGraph AI
    </span>
  </div>
);

// Decorative Corner Motif
export const CornerMotif: React.FC<{ className?: string; style?: React.CSSProperties }> = ({ className = '', style = {} }) => (
  <svg viewBox="0 0 200 200" fill="none" stroke="currentColor" strokeWidth="3" className={className} style={style} xmlns="http://www.w3.org/2000/svg">
    <path d="M 20 20 L 60 20 L 60 60 L 20 60 Z" />
    <circle cx="100" cy="40" r="20" />
    <path d="M 140 20 L 180 60 L 140 100 Z" />
    <path d="M 20 100 Q 60 100 60 140 L 20 140 Z" />
    <path d="M 100 100 L 160 100 A 20 20 0 0 1 160 140 L 100 140 A 20 20 0 0 1 100 100 Z" />
    <circle cx="40" cy="180" r="15" />
    <path d="M 80 160 L 120 160 L 100 190 Z" />
  </svg>
);
