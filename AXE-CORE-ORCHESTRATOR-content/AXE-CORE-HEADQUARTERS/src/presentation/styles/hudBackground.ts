import type { CSSProperties } from 'react';

/**
 * Shared "one environment" background for every canvas/graph-style surface
 * (Architecture, Memory's Visual Explorer, …) — pure black base (matches the
 * global --bg-base token, not a bespoke dark-blue tint) with a faint cyan
 * depth-glow instead of flat color, so these pages read as one holographic
 * space rather than separately-styled panels bolted together.
 */
export const HUD_BASE_BG =
  'radial-gradient(120% 90% at 50% 0%, rgba(34,211,238,0.07), rgba(0,0,0,0) 55%), ' +
  'radial-gradient(90% 70% at 50% 120%, rgba(34,211,238,0.05), rgba(0,0,0,0) 60%), ' +
  'var(--bg-base)';

/** Subtle dot-grid layer for open canvas space — replaces the old line-grid,
 *  reads as depth/texture rather than a spreadsheet. */
export const HUD_DOT_GRID_STYLE: CSSProperties = {
  backgroundImage: 'radial-gradient(rgba(34,211,238,0.16) 1px, transparent 1px)',
  backgroundSize: '26px 26px',
};
