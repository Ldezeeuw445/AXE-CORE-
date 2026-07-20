import type { ReactNode, ButtonHTMLAttributes } from 'react';
import { cn } from '@/shared/utils';

interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  children: ReactNode;
  active?: boolean;
}

export function IconButton({ children, active, className, ...props }: IconButtonProps) {
  return (
    <button
      className={cn(
        'inline-flex items-center justify-center rounded-lg transition-all duration-fast',
        'w-8 h-8',
        className
      )}
      style={{
        backgroundColor: active ? '#1A1A2E' : 'transparent',
        color: active ? 'var(--accent-cyan)' : 'var(--text-muted)',
      }}
      onMouseEnter={(e) => {
        if (!active) {
          e.currentTarget.style.backgroundColor = '#1A1A1A';
          e.currentTarget.style.color = 'var(--text-secondary)';
        }
      }}
      onMouseLeave={(e) => {
        if (!active) {
          e.currentTarget.style.backgroundColor = 'transparent';
          e.currentTarget.style.color = 'var(--text-muted)';
        }
      }}
      {...props}
    >
      {children}
    </button>
  );
}
