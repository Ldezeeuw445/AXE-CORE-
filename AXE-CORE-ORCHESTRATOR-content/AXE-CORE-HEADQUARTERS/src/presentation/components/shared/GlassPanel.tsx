import type { ReactNode, HTMLAttributes } from 'react';
import { cn } from '@/shared/utils';

interface GlassPanelProps extends HTMLAttributes<HTMLDivElement> {
  children: ReactNode;
  variant?: 'default' | 'light';
}

export function GlassPanel({ children, variant = 'default', className, ...props }: GlassPanelProps) {
  return (
    <div
      className={cn(
        'rounded-xl',
        variant === 'default' ? 'shadow-edge-glow' : 'shadow-matte',
        className
      )}
      style={{
        background: variant === 'default' ? 'rgba(10, 10, 10, 0.8)' : 'rgba(17, 17, 17, 0.5)',
        backdropFilter: 'blur(12px)',
        WebkitBackdropFilter: 'blur(12px)',
        border: '1px solid rgba(255, 255, 255, 0.04)',
      }}
      {...props}
    >
      {children}
    </div>
  );
}
