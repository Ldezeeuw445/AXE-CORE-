/**
 * AXE Surface — React primitives (see src/design/axe-surface.css).
 */
import * as React from 'react';
import { cn } from '@/shared/utils';

export function Panel({
  focus = false,
  inset = false,
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement> & { focus?: boolean; inset?: boolean }) {
  return (
    <div
      className={cn(
        'rounded-panel overflow-hidden',
        inset ? 'axe-panel axe-panel--inset' : focus ? 'axe-panel' : 'axe-panel axe-panel--flat',
        className,
      )}
      {...props}
    />
  );
}

export function Ground({ className, children, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn('axe-ground relative min-h-full', className)} {...props}>
      <div className="relative h-full">{children}</div>
    </div>
  );
}

export function Label({ className, ...props }: React.HTMLAttributes<HTMLSpanElement>) {
  return <span className={cn('axe-label', className)} {...props} />;
}

export function Chip({
  pressed = false,
  icon,
  className,
  children,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { pressed?: boolean; icon?: React.ReactNode }) {
  return (
    <button type="button" aria-pressed={pressed} className={cn('axe-chip', className)} {...props}>
      {icon}
      {children}
    </button>
  );
}

export function IconButton({
  accent = false,
  className,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { accent?: boolean }) {
  return (
    <button
      type="button"
      className={cn('axe-icon-btn', accent && 'axe-icon-btn--accent', className)}
      {...props}
    />
  );
}

export function GhostButton({ className, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return <button type="button" className={cn('axe-ghost', className)} {...props} />;
}
