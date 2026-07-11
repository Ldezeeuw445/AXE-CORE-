import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

interface WidgetCardProps {
  title: string;
  children: ReactNode;
  className?: string;
  headerAction?: ReactNode;
  style?: React.CSSProperties;
  noPadding?: boolean;
}

export function WidgetCard({ title, children, className, headerAction, style, noPadding }: WidgetCardProps) {
  return (
    <div
      className={cn(
        'widget-card flex flex-col gap-3',
        className
      )}
      style={{
        background: '#0A0A0A',
        border: '1px solid rgba(255,255,255,0.04)',
        borderRadius: '12px',
        padding: noPadding ? '0' : '16px',
        transition: 'all 0.2s ease-out',
        boxShadow: 'inset 0 1px 0 0 rgba(255, 255, 255, 0.03), inset 0 -1px 0 0 rgba(0, 0, 0, 0.2), 0 0 0 1px rgba(255, 255, 255, 0.02)',
        ...style,
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.borderColor = 'rgba(255,255,255,0.06)';
        e.currentTarget.style.transform = 'translateY(-1px)';
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.borderColor = 'rgba(255,255,255,0.04)';
        e.currentTarget.style.transform = 'translateY(0)';
      }}
    >
      <div className="flex items-center justify-between">
        <h3
          className="text-section-title tracking-tight-custom"
          style={{ color: '#FFFFFF' }}
        >
          {title}
        </h3>
        {headerAction}
      </div>
      {children}
    </div>
  );
}
