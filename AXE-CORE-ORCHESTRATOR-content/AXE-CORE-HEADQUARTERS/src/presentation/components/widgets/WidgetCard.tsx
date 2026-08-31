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
        // min-h-0 + overflow-hidden is what makes "all blocks the same size"
        // hold: without it a card with a long list stretches its grid row and
        // drags every neighbour taller with it.
        'widget-card flex min-h-0 flex-col gap-3 overflow-hidden',
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
        /* AXE Surface radius token instead of a literal, so a card and a panel
         * can never drift apart the way they had already started to. */
        borderRadius: 'var(--radius)',
        padding: noPadding ? '0' : '16px',
        ...style,
      }}
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          {icon}
          {/* The title is a section label, not a heading: 11px, uppercase,
           * wide tracking, muted. A card title competing with the numbers
           * underneath it is what made these grids read as busy — the label
           * should name the card and then get out of the way. */}
          <h3
            className="truncate text-[11px] font-semibold uppercase tracking-[.1em]"
            style={{ color: 'var(--text-muted)' }}
          >
            {title}
          </h3>
        </div>
        {headerAction}
      </div>
      {/* The card's own scroll. The page keeps its shape; the overflow moves
          in here. */}
      <div className="min-h-0 flex-1 overflow-y-auto">{children}</div>
    </div>
  );
}
