import { useEffect, useState } from 'react';

interface ProgressRingProps {
  value: number;
  label: string;
  size?: 'sm' | 'md' | 'lg';
  color?: string;
  suffix?: string;
}

const sizeMap = {
  sm: { diameter: 48, stroke: 4, fontSize: '0.75rem' },
  md: { diameter: 64, stroke: 6, fontSize: '0.875rem' },
  lg: { diameter: 96, stroke: 8, fontSize: '1.25rem' },
};

export function ProgressRing({
  value,
  label,
  size = 'md',
  color = 'var(--accent-cyan)',
  suffix = '%',
}: ProgressRingProps) {
  const { diameter, stroke, fontSize } = sizeMap[size];
  const radius = (diameter - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const [animatedValue, setAnimatedValue] = useState(0);

  useEffect(() => {
    const timer = setTimeout(() => setAnimatedValue(value), 100);
    return () => clearTimeout(timer);
  }, [value]);

  const offset = circumference - (animatedValue / 100) * circumference;

  return (
    <div className="flex flex-col items-center gap-1">
      <div style={{ position: 'relative', width: diameter, height: diameter }}>
        <svg
          width={diameter}
          height={diameter}
          style={{ transform: 'rotate(-90deg)' }}
        >
          <circle
            cx={diameter / 2}
            cy={diameter / 2}
            r={radius}
            fill="none"
            stroke="rgba(255,255,255,0.05)"
            strokeWidth={stroke}
          />
          <circle
            cx={diameter / 2}
            cy={diameter / 2}
            r={radius}
            fill="none"
            stroke={color}
            strokeWidth={stroke}
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={offset}
            style={{ transition: 'stroke-dashoffset 1s ease-out' }}
          />
        </svg>
        <div
          className="absolute inset-0 flex flex-col items-center justify-center"
        >
          <span
            className="font-mono-data font-semibold"
            style={{ fontSize, color: 'var(--text-primary)' }}
          >
            {animatedValue}{suffix}
          </span>
        </div>
      </div>
      <span className="text-xs-custom" style={{ color: 'var(--text-muted)' }}>
        {label}
      </span>
    </div>
  );
}
