import React from 'react';

interface MiniChartProps {
  data?: number[];
  width?: number;
  height?: number;
  className?: string;
}

export const MiniChart = React.memo(function MiniChart({
  data = [20, 45, 30, 60, 40, 75, 50, 65, 35, 55],
  width = 80,
  height = 24,
  className,
}: MiniChartProps) {
  const max = Math.max(...data);
  const min = Math.min(...data);
  const range = max - min || 1;

  const points = data.map((v, i) => {
    const x = (i / (data.length - 1)) * width;
    const y = height - ((v - min) / range) * height;
    return `${x},${y}`;
  });

  const areaPoints = `0,${height} ${points.join(' ')} ${width},${height}`;

  return (
    <svg
      width={width}
      height={height}
      className={className}
      style={{ overflow: 'visible' }}
    >
      <defs>
        <linearGradient id="miniChartGrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="var(--accent-cyan)" stopOpacity={0.3} />
          <stop offset="100%" stopColor="var(--accent-cyan)" stopOpacity={0} />
        </linearGradient>
      </defs>
      <polygon points={areaPoints} fill="url(#miniChartGrad)" />
      <polyline
        points={points.join(' ')}
        fill="none"
        stroke="var(--accent-cyan)"
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
});
