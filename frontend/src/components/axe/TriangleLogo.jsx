import React from "react";

export function TriangleLogo({ size = 24, animate = false }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" fill="none" aria-label="AXE" data-testid="axe-triangle-logo">
      <defs>
        <linearGradient id="axe-grad" x1="0" y1="0" x2="64" y2="64" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#00D4FF" />
          <stop offset="100%" stopColor="#7C3AED" />
        </linearGradient>
        <filter id="axe-glow" x="-20%" y="-20%" width="140%" height="140%">
          <feGaussianBlur stdDeviation="2" result="b" />
          <feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge>
        </filter>
      </defs>
      <g filter="url(#axe-glow)">
        <path d="M32 6 L58 56 L6 56 Z" fill="url(#axe-grad)" />
      </g>
      {animate && (
        <path d="M32 6 L58 56 L6 56 Z" stroke="#00D4FF" strokeWidth="0.6" fill="none" opacity="0.4">
          <animate attributeName="opacity" values="0.2;0.7;0.2" dur="2.4s" repeatCount="indefinite" />
        </path>
      )}
    </svg>
  );
}
