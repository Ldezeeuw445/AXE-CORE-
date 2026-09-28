/**
 * MemoryDock — the NorthSea-Desk-style fold-out for Terrain and Neural.
 *
 * Copied mechanic from `presentation/pages/northsea/DealsTabel.tsx`: a slim
 * header row (chevron toggle, click not hover) above a conditionally-mounted
 * body, styled to align edge-to-edge with the composer below it using the
 * composer's own token set (`--axe-vak-*`), not the panel token set — so it
 * reads as one continuous band with the composer, the same way DealsTabel
 * reads as one band with NorthSea's.
 *
 * This also absorbs Fix 3's depth-level control. That control used to be its
 * own `<PlaatDock>` pill with a real CSS bug (a redundant inner
 * `position/bottom` rule stacked on top of the slot's own offset — see the
 * git history of NeuralMemorySystem.css's old `.nm-depthbar`). Rather than
 * fix that pill AND add a second dock element beside it, the depth buttons
 * move into this dock's own header row: one small centered control group,
 * not two competing docks fighting for the same strip above the composer.
 *
 * Shared by Terrain (`NeuralMemorySystem.tsx`) and Neural (`NeuralBrain.tsx`)
 * so the two views don't grow two different fold-out implementations for the
 * same job — the same reasoning as `hubIcons.ts` being one shared module
 * instead of two private copies.
 */
import { useState } from 'react';
import { ChevronDown, ChevronUp, Lock } from 'lucide-react';
import { PlaatSlot } from '@/presentation/components/layout/PlaatSlots';
import './MemoryDock.css';

export interface MemoryDockStatRow {
  label: string;
  value: string;
  /** false renders the value in a warning tone — for a degraded reading. */
  ok?: boolean;
}

export interface MemoryDockColumn {
  title: string;
  rows: MemoryDockStatRow[];
}

export interface MemoryDockProps {
  depthLevel: number;
  depthLevels: number[];
  isDepthLocked?: (level: number) => boolean;
  onSetDepth: (level: number) => void;
  columns: MemoryDockColumn[];
  /** Closed by default: the depth row already earns the strip's attention,
   *  and image 14's dock does not compete with the depth control for space. */
  defaultOpen?: boolean;
}

export function MemoryDock({
  depthLevel, depthLevels, isDepthLocked, onSetDepth, columns, defaultOpen = false,
}: MemoryDockProps) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <PlaatSlot slot="dock">
      {/* Zelfde materiaal en breedte als de composer eronder (Fix 7): de
          composer's eigen tokenset, niet de paneel-tokens, en dezelfde
          --axe-chat-links/rechts marges als DealsTabel gebruikt. */}
      <div
        className="axe-memdock"
        style={{
          marginLeft: 'var(--axe-chat-links, 24px)',
          marginRight: 'var(--axe-chat-rechts, 24px)',
          borderRadius: 'var(--axe-vak-hoek, 24px)',
          border: '1px solid var(--axe-vak-lijn)',
          background: 'var(--axe-vak-vlak)',
          boxShadow: 'var(--axe-vak-zweef)',
        }}
        data-axe-doel="memory-dock"
      >
        <div className="axe-memdock-head">
          <span className="axe-memdock-label">Depth level</span>
          <div className="axe-memdock-depths">
            {depthLevels.map((n) => {
              const locked = isDepthLocked?.(n) ?? false;
              return (
                <button
                  key={n}
                  type="button"
                  className={`axe-memdock-depth${depthLevel === n ? ' active' : ''}${locked ? ' locked' : ''}`}
                  disabled={locked}
                  onClick={() => onSetDepth(n)}
                  title={locked ? 'Focus a hub first to unlock deeper levels' : `Depth ${n}`}
                >
                  {locked ? <Lock size={10} /> : n}
                </button>
              );
            })}
          </div>
          <button
            type="button"
            className="axe-memdock-toggle"
            onClick={() => setOpen((v) => !v)}
            aria-label={open ? 'Collapse memory stats' : 'Expand memory stats'}
            title={open ? 'Collapse' : 'Expand'}
          >
            {open ? <ChevronDown size={14} /> : <ChevronUp size={14} />}
          </button>
        </div>

        {open && (
          <div className="axe-memdock-body">
            {columns.map((col) => (
              <div className="axe-memdock-col" key={col.title}>
                <div className="axe-memdock-col-title">{col.title}</div>
                {col.rows.length === 0 && <div className="axe-memdock-row axe-memdock-row--empty">—</div>}
                {col.rows.map((r) => (
                  <div className="axe-memdock-row" key={r.label}>
                    <span className="k">{r.label}</span>
                    <span className="v" style={r.ok === false ? { color: 'var(--warning, #f59e0b)' } : undefined}>{r.value}</span>
                  </div>
                ))}
              </div>
            ))}
          </div>
        )}
      </div>
    </PlaatSlot>
  );
}

export default MemoryDock;
