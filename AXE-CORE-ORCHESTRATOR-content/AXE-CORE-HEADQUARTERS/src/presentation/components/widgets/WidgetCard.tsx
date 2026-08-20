import type { ReactNode } from 'react';
import { cn } from '@/shared/utils';

interface WidgetCardProps {
  title: string;
  children: ReactNode;
  className?: string;
  headerAction?: ReactNode;
  icon?: ReactNode;
  style?: React.CSSProperties;
  noPadding?: boolean;
}

export function WidgetCard({ title, children, className, headerAction, icon, style, noPadding }: WidgetCardProps) {
  return (
    <div
      className={cn(
        'widget-card flex flex-col gap-3',
        className
      )}
      /* Only the box model lives here now.
       *
       * Colour and hover moved to the .widget-card rules in index.css. They had
       * to: an inline boxShadow outranks a stylesheet's :hover box-shadow, so
       * the card's own resting shadow quietly won and the hover glow never
       * painted. Hover was also being driven from JS, which meant two places
       * decided what a card looked like and neither knew about the other. */
      style={{
        borderRadius: '12px',
        padding: noPadding ? '0' : '16px',
        ...style,
      }}
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          {icon}
          <h3
            className="text-section-title tracking-tight-custom"
            style={{ color: 'var(--text-primary)' }}
          >
            {title}
          </h3>
        </div>
        {headerAction}
      </div>
      {children}
    </div>
  );
}
