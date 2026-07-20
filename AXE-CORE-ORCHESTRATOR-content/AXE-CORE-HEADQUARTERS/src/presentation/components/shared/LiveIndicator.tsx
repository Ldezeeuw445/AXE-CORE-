import React from 'react';

interface LiveIndicatorProps {
  size?: number;
  color?: string;
  className?: string;
}

export const LiveIndicator = React.memo(function LiveIndicator({
  size = 6,
  color = 'var(--live-indicator)',
  className = '',
}: LiveIndicatorProps) {
  return (
    <span
      className={`inline-block rounded-full animate-pulse-live ${className}`}
      style={{
        width: size,
        height: size,
        backgroundColor: color,
        boxShadow: `0 0 6px ${color}`,
      }}
    />
  );
});
