interface MetricDisplayProps {
  value: string | number;
  label: string;
  delta?: number;
  className?: string;
}

export function MetricDisplay({ value, label, delta, className }: MetricDisplayProps) {
  const deltaColor =
    delta === undefined
      ? undefined
      : delta > 0
        ? 'var(--success)'
        : delta < 0
          ? 'var(--error)'
          : 'var(--text-muted)';

  return (
    <div className={`flex flex-col gap-1 ${className || ''}`}>
      <span
        className="font-mono-data text-mono-lg"
        style={{ color: 'var(--text-primary)' }}
      >
        {value}
      </span>
      <span className="text-small" style={{ color: 'var(--text-secondary)' }}>
        {label}
      </span>
      {delta !== undefined && (
        <span className="text-xs-custom flex items-center gap-0.5" style={{ color: deltaColor }}>
          {delta > 0 ? '↑' : delta < 0 ? '↓' : '→'} {Math.abs(delta)}%
        </span>
      )}
    </div>
  );
}
