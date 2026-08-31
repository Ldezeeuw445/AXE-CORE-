/**
 * AxeUI — shared premium surfaces for every tab.
 * Matches Home: pure black, cyan accent, cream labels, tight spacing, Lucide only.
 */
import type { ButtonHTMLAttributes, CSSProperties, ReactNode } from 'react';
import { cn } from '@/shared/utils';
import { HUD_BASE_BG } from '@/presentation/styles/hudBackground';

export const AXE_CREAM = '#F5F0E6';
export const AXE_CYAN = 'var(--accent-cyan)';

export function PageShell({
  children,
  className,
  padded = true,
  canvas = false,
}: {
  children: ReactNode;
  className?: string;
  padded?: boolean;
  canvas?: boolean;
}) {
  return (
    <div
      className={cn('h-full min-h-0 flex flex-col overflow-hidden', className)}
      style={{
        background: canvas ? HUD_BASE_BG : 'var(--bg-base)',
        color: 'var(--text-primary)',
      }}
    >
      <div className={cn('flex-1 min-h-0 overflow-y-auto', padded && 'px-4 py-4 sm:px-6 sm:py-5')}>
        {children}
      </div>
    </div>
  );
}

export function PageHeader({
  eyebrow,
  title,
  description,
  actions,
  className,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  actions?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('flex items-start justify-between gap-4 mb-5', className)}>
      <div className="min-w-0">
        {eyebrow && (
          <div className="text-[9px] font-mono tracking-[0.22em] uppercase mb-1.5" style={{ color: 'var(--accent-cyan)' }}>
            {eyebrow}
          </div>
        )}
        <h1 className="text-[18px] sm:text-[20px] font-semibold tracking-tight truncate" style={{ color: AXE_CREAM }}>
          {title}
        </h1>
        {description && (
          <p className="mt-1 text-[12px] leading-relaxed max-w-2xl" style={{ color: 'var(--text-secondary)' }}>
            {description}
          </p>
        )}
      </div>
      {actions && <div className="flex items-center gap-2 flex-shrink-0">{actions}</div>}
    </div>
  );
}

export function AxeCard({
  children,
  className,
  hover = false,
  padding = 'md',
  onClick,
  style,
}: {
  children: ReactNode;
  className?: string;
  hover?: boolean;
  padding?: 'none' | 'sm' | 'md' | 'lg';
  onClick?: () => void;
  style?: CSSProperties;
}) {
  const pad = padding === 'none' ? '' : padding === 'sm' ? 'p-3' : padding === 'lg' ? 'p-5' : 'p-4';
  const Comp = onClick ? 'button' : 'div';
  return (
    <Comp
      type={onClick ? 'button' : undefined}
      onClick={onClick}
      className={cn(
        'rounded-xl text-left w-full transition-all duration-200',
        pad,
        hover && 'hover:border-[var(--tint-line)] hover:bg-[rgba(255,255,255,0.02)]',
        onClick && 'cursor-pointer',
        className,
      )}
      style={{
        background: 'rgba(255,255,255,0.02)',
        border: '1px solid rgba(255,255,255,0.06)',
        boxShadow: '0 0 0 1px rgba(0,0,0,0.4) inset',
        ...style,
      }}
    >
      {children}
    </Comp>
  );
}

export function AxeButton({
  children,
  variant = 'primary',
  size = 'md',
  className,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
  size?: 'sm' | 'md' | 'lg';
}) {
  const sizes = {
    sm: 'px-2.5 py-1 text-[11px] rounded-lg',
    md: 'px-3.5 py-1.5 text-[12px] rounded-lg',
    lg: 'px-4 py-2 text-[13px] rounded-xl',
  };
  const variants: Record<string, CSSProperties> = {
    primary: {
      background: 'var(--tint)',
      border: '1px solid var(--tint-line)',
      color: 'var(--accent-cyan)',
    },
    secondary: {
      background: 'rgba(255,255,255,0.04)',
      border: '1px solid rgba(255,255,255,0.1)',
      color: AXE_CREAM,
    },
    ghost: {
      background: 'transparent',
      border: '1px solid transparent',
      color: 'var(--text-secondary)',
    },
    danger: {
      background: 'rgba(239,68,68,0.12)',
      border: '1px solid rgba(239,68,68,0.35)',
      color: 'var(--error)',
    },
  };
  return (
    <button
      className={cn(
        'inline-flex items-center justify-center gap-1.5 font-medium transition-all duration-150',
        'disabled:opacity-40 disabled:pointer-events-none',
        'hover:brightness-110 active:scale-[0.98]',
        sizes[size],
        className,
      )}
      style={variants[variant]}
      {...props}
    >
      {children}
    </button>
  );
}

export function StatPill({
  label,
  value,
  tone = 'neutral',
}: {
  label: string;
  value: string | number;
  tone?: 'neutral' | 'cyan' | 'success' | 'warn' | 'danger';
}) {
  const colors: Record<string, string> = {
    neutral: 'rgba(255,255,255,0.55)',
    cyan: 'var(--accent-cyan)',
    success: 'var(--success)',
    warn: 'var(--warning)',
    danger: 'var(--error)',
  };
  return (
    <div
      className="rounded-xl px-3 py-2 min-w-[88px]"
      style={{
        background: 'rgba(255,255,255,0.025)',
        border: '1px solid rgba(255,255,255,0.06)',
      }}
    >
      <div className="text-[9px] uppercase tracking-[0.16em]" style={{ color: 'var(--text-muted)' }}>
        {label}
      </div>
      <div className="text-[15px] font-semibold font-mono-data mt-0.5" style={{ color: colors[tone] }}>
        {value}
      </div>
    </div>
  );
}

export function EmptyState({
  title,
  description,
  action,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div
      className="flex flex-col items-center justify-center text-center rounded-xl px-6 py-14"
      style={{
        background: 'rgba(255,255,255,0.015)',
        border: '1px dashed rgba(255,255,255,0.08)',
      }}
    >
      <div className="text-[14px] font-medium" style={{ color: AXE_CREAM }}>
        {title}
      </div>
      {description && (
        <p className="mt-1.5 text-[12px] max-w-sm" style={{ color: 'var(--text-secondary)' }}>
          {description}
        </p>
      )}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function SectionLabel({ children }: { children: ReactNode }) {
  return (
    <div className="text-[9px] font-mono tracking-[0.18em] uppercase mb-2.5" style={{ color: 'rgba(255,255,255,0.35)' }}>
      {children}
    </div>
  );
}

export function CardGrid({
  children,
  cols = 3,
  className,
}: {
  children: ReactNode;
  cols?: 2 | 3 | 4;
  className?: string;
}) {
  const map = {
    2: 'grid-cols-1 sm:grid-cols-2',
    3: 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3',
    4: 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-4',
  };
  return <div className={cn('grid gap-3', map[cols], className)}>{children}</div>;
}
