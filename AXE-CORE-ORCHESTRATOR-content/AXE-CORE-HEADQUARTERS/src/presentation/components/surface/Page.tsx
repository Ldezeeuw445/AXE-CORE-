/**
 * Page · Grid · Block — the layout primitives.
 *
 * These exist because "make all the blocks the same size" is not something a
 * page can be asked to do. Thirty-five pages each hand-rolled their own grid,
 * so AI Core has eight blocks at one size, Settings thirteen at another, MCP
 * twelve at a third, and nothing lines up with anything. Asking each page to
 * be tidy is asking thirty-five separate authors to agree, which is why it has
 * never stuck no matter how often it was asked for.
 *
 * So the equality is structural here, not per page:
 *
 *   - Grid uses fixed track sizes, so every Block in a row is the same width
 *     by construction. A page cannot opt out by writing its own columns.
 *   - Blocks in a row are the same height because the row stretches them, and
 *     a Block's content scrolls INSIDE it. That is the second half of the ask:
 *     the page keeps its shape and the overflow moves into the block, instead
 *     of one long block dragging the whole page taller.
 *   - `span` is the only size control, and it only takes whole columns. A
 *     block can be wider, never a different shape.
 *
 * Everything is on AXE Surface tokens, so a Block and the command bar are the
 * same material.
 */
import type { ReactNode } from 'react';
import { cn } from '@/shared/utils';

/* ────────────────────────────────────────────────────────────────────
   Page — the outer frame. Owns the only vertical scroll on the screen.
   ──────────────────────────────────────────────────────────────────── */
export function Page({
  title,
  subtitle,
  actions,
  children,
  className,
}: {
  title?: ReactNode;
  subtitle?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('flex h-full min-h-0 flex-col', className)}>
      {(title || actions) && (
        <header className="flex flex-none items-start justify-between gap-4 px-4 pb-3 pt-4 md:px-6">
          <div className="min-w-0">
            {title && (
              <h1
                className="truncate text-lg font-semibold tracking-tight"
                style={{ color: 'var(--text-primary)' }}
              >
                {title}
              </h1>
            )}
            {subtitle && (
              <p className="mt-0.5 text-[12px]" style={{ color: 'var(--text-muted)' }}>
                {subtitle}
              </p>
            )}
          </div>
          {actions && <div className="flex flex-none items-center gap-2">{actions}</div>}
        </header>
      )}
      {/* The one scroll container. Blocks never make the page taller; they
          scroll their own content instead. */}
      <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-6 md:px-6">{children}</div>
    </div>
  );
}

/* ────────────────────────────────────────────────────────────────────
   Grid — equal columns, equal rows.
   ──────────────────────────────────────────────────────────────────── */
export function Grid({
  children,
  className,
  /** Row height. Fixed on purpose: this is what makes rows line up. */
  rowHeight = 220,
  /** Minimum column width before the grid drops a column. */
  min = 260,
}: {
  children: ReactNode;
  className?: string;
  rowHeight?: number;
  min?: number;
}) {
  return (
    <div
      className={cn('grid gap-3', className)}
      style={{
        // auto-fill + minmax: columns are identical at every viewport, and the
        // count changes rather than the width. auto-FIT would stretch the last
        // row's blocks to fill the space, which is exactly the raggedness this
        // is meant to remove.
        gridTemplateColumns: `repeat(auto-fill, minmax(${min}px, 1fr))`,
        gridAutoRows: `${rowHeight}px`,
      }}
    >
      {children}
    </div>
  );
}

/* ────────────────────────────────────────────────────────────────────
   Block — one cell. Header stays, body scrolls.
   ──────────────────────────────────────────────────────────────────── */
export function Block({
  title,
  action,
  span = 1,
  rows = 1,
  children,
  className,
  bodyClassName,
  /** Drop the padding — for a chart, map or terminal that fills the block. */
  bare = false,
}: {
  title?: ReactNode;
  action?: ReactNode;
  /** Whole columns only. A block can be wider, never a different shape. */
  span?: 1 | 2 | 3 | 4;
  rows?: 1 | 2 | 3;
  children: ReactNode;
  className?: string;
  bodyClassName?: string;
  bare?: boolean;
}) {
  return (
    <section
      className={cn('axe-surface--inset flex min-h-0 flex-col overflow-hidden', className)}
      style={{
        gridColumn: `span ${span}`,
        gridRow: `span ${rows}`,
        borderRadius: 'var(--radius)',
        background: 'var(--surface-bg)',
        border: '1px solid var(--border-subtle)',
      }}
    >
      {title && (
        <header
          className="flex flex-none items-center justify-between gap-2 px-3.5 pb-2 pt-3"
        >
          {/* Section label, not a heading. A block title competing with the
              numbers underneath it is what made these grids read as busy. */}
          <h2
            className="truncate text-[11px] font-semibold uppercase tracking-[.1em]"
            style={{ color: 'var(--text-muted)' }}
          >
            {title}
          </h2>
          {action}
        </header>
      )}
      {/* The block's own scroll. This is the half that keeps the page calm:
          a long list lives inside its block instead of stretching the page. */}
      <div
        className={cn(
          'min-h-0 flex-1 overflow-y-auto',
          !bare && 'px-3.5 pb-3.5',
          !title && !bare && 'pt-3.5',
          bodyClassName,
        )}
      >
        {children}
      </div>
    </section>
  );
}

/* ────────────────────────────────────────────────────────────────────
   Stat — the "one number" block body, so every metric looks the same.
   ──────────────────────────────────────────────────────────────────── */
export function Stat({
  value,
  label,
  tone = 'default',
}: {
  value: ReactNode;
  label?: ReactNode;
  tone?: 'default' | 'ok' | 'warn' | 'err' | 'accent';
}) {
  const color = {
    default: 'var(--text-primary)',
    ok: 'var(--success)',
    warn: 'var(--warning)',
    err: 'var(--error)',
    accent: 'var(--accent-cyan)',
  }[tone];
  return (
    <div className="flex h-full flex-col items-center justify-center gap-1 text-center">
      <span
        className="font-mono text-2xl font-semibold tabular-nums leading-none"
        style={{ color }}
      >
        {value}
      </span>
      {label && (
        <span className="text-[12px]" style={{ color: 'var(--text-muted)' }}>
          {label}
        </span>
      )}
    </div>
  );
}

/* ────────────────────────────────────────────────────────────────────
   Two ready-made shapes.
   
   Every card page in the app turned out to be the same two rows: a strip of
   metrics on top, then a grid of content below. They just each picked their
   own column counts and their own gap — five different gaps across five
   pages, which is why nothing ever lined up with anything.
   
   These are class strings rather than components on purpose: a page can
   adopt them by swapping one className, with no JSX restructuring and so no
   chance of quietly changing behaviour while "just tidying the layout".
   ──────────────────────────────────────────────────────────────────── */

/**
 * The metric strip. Small, fixed height, always equal.
 *
 * auto-FIT here, unlike CARD_GRID below, and the difference matters. auto-fill
 * keeps empty tracks: MCP has three metrics, which at this width produced a
 * seven-column grid with four empty columns and the numbers stranded on the
 * left. A metric strip is meant to span the width, so the tracks should
 * collapse and the three stats should share it.
 *
 * The content grid keeps auto-fill for the opposite reason: there, a lone card
 * on the last row stretching to full width is exactly the raggedness this is
 * meant to remove.
 */
export const STAT_ROW =
  'grid gap-3 mb-4 [grid-template-columns:repeat(auto-fit,minmax(158px,1fr))] [grid-auto-rows:104px]';

/** The content grid. Equal columns, equal rows, cards scroll inside. */
export const CARD_GRID =
  'grid gap-3 [grid-template-columns:repeat(auto-fill,minmax(320px,1fr))] [grid-auto-rows:336px]';

/**
 * Equal columns, natural height — for LISTS laid out in columns.
 *
 * Learned by getting it wrong: MCP's server grid looked like a card grid in
 * the source and is actually a two-column list of short rows. Forcing the
 * card row-height onto it produced 440px cells each holding a 50px item, so
 * the "tidy" version had more empty space than the messy one it replaced.
 *
 * The rule that came out of it: fixed row heights are for blocks that hold
 * content. A row that is one line tall should stay one line tall.
 */
export const LIST_GRID =
  'grid gap-3 [grid-template-columns:repeat(auto-fill,minmax(320px,1fr))]';

/** Taller variant for pages whose cards hold real lists. */
export const CARD_GRID_TALL =
  'grid gap-3 [grid-template-columns:repeat(auto-fill,minmax(320px,1fr))] [grid-auto-rows:440px]';
