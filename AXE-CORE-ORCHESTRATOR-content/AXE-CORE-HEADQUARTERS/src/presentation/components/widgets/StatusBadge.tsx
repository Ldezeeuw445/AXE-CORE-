import { cn } from '@/shared/utils';

type StatusVariant = 'online' | 'active' | 'warning' | 'offline' | 'standby';

interface StatusBadgeProps {
  variant: StatusVariant;
  label?: string;
  size?: 'sm' | 'md';
  className?: string;
}

const variantStyles: Record<StatusVariant, { dot: string; text: string; bg: string }> = {
  online: {
    dot: 'var(--success)',
    text: 'var(--success)',
    bg: 'rgba(16,185,129,0.06)',
  },
  active: {
    dot: 'var(--accent-cyan)',
    text: 'var(--accent-cyan)',
    bg: 'rgba(34,211,238,0.06)',
  },
  warning: {
    dot: 'var(--warning)',
    text: 'var(--warning)',
    bg: 'rgba(245,158,11,0.06)',
  },
  offline: {
    dot: 'var(--error)',
    text: 'var(--error)',
    bg: 'rgba(239,68,68,0.06)',
  },
  standby: {
    dot: 'var(--text-muted)',
    text: 'var(--text-muted)',
    bg: 'rgba(74,77,84,0.06)',
  },
};

const defaultLabels: Record<StatusVariant, string> = {
  online: 'Online',
  active: 'Active',
  warning: 'Warning',
  offline: 'Offline',
  standby: 'Standby',
};

export function StatusBadge({ variant, label, size = 'md', className }: StatusBadgeProps) {
  const styles = variantStyles[variant];
  const displayLabel = label || defaultLabels[variant];

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded font-medium',
        size === 'sm' ? 'px-1.5 py-0.5 text-[10px]' : 'px-2 py-0.5 text-xs-custom',
        className
      )}
      style={{
        backgroundColor: styles.bg,
        color: styles.text,
      }}
    >
      <span
        className="rounded-full"
        style={{
          width: size === 'sm' ? '4px' : '6px',
          height: size === 'sm' ? '4px' : '6px',
          backgroundColor: styles.dot,
        }}
      />
      {displayLabel}
    </span>
  );
}
