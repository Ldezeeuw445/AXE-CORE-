/**
 * De knoppenrij midden boven: grow, het aantal nodes, Awareness en de
 * schakelaar tussen Core, Neural, Terrain en Architecture.
 *
 * ## Waarom dit in de schil zit en niet op Home
 *
 * Dit stond in Home, dus het bestond alleen daar. Ga je naar een andere tab,
 * dan is de weg terug naar Terrain of Neural weg -- terwijl dit juist de
 * snelste route ertussen is. Het hoort bij de plaat, net als de klok en de
 * navigatie onderin: chroom dat altijd staat, op elke tab, en dat niemand in
 * de weg zit omdat het op de plaat ligt in plaats van in een balk.
 *
 * De stand zelf woont in coreViewStore, want twee plekken die dezelfde stand
 * bijhouden lopen gegarandeerd uit elkaar.
 */
import { BrainCircuit, Mountain, Network, Zap } from 'lucide-react';
import { AppGrowthBadge } from '@/presentation/components/axe-core/AppGrowthBadge';
import { MemoryGrowthBadge } from '@/presentation/components/axe-core/MemoryGrowthBadge';
import { useIsMobile } from '@/presentation/hooks/use-mobile';
import { useCoreViewStore, type CoreView } from '@/presentation/store/coreViewStore';

const SEGMENTS: Array<{ id: CoreView; label: string; icon: typeof BrainCircuit | null }> = [
  { id: 'axe', label: 'Core', icon: null },
  { id: 'neural', label: 'Neural', icon: BrainCircuit },
  { id: 'terrain', label: 'Terrain', icon: Mountain },
  { id: 'runtime', label: 'Architecture', icon: Network },
];

export function PlaatViewSwitch() {
  const isMobile = useIsMobile();
  const coreView = useCoreViewStore(s => s.coreView);
  const setCoreView = useCoreViewStore(s => s.setCoreView);
  const showAwareness = useCoreViewStore(s => s.showAwareness);
  const setShowAwareness = useCoreViewStore(s => s.setShowAwareness);

  return (
    <div className="axe-viewctl flex items-center gap-2 over-canvas-group">
      {/* Op een smal scherm is deze rij breder dan het halve scherm en loopt
          hij in de statusregel links. De badges zijn dan het eerste dat mag
          vallen: ze zijn informatie, geen navigatie. */}
      {!isMobile && <AppGrowthBadge />}
      {!isMobile && <MemoryGrowthBadge />}
      <button
        onClick={() => setShowAwareness(!showAwareness)}
        className="flex items-center gap-1.5 rounded-full text-[10px] font-medium transition-all"
        style={{
          padding: isMobile ? '6px' : '6px 12px',
          background: showAwareness ? 'var(--tint)' : 'rgba(255,255,255,0.04)',
          border: `1px solid ${showAwareness ? 'var(--tint-line)' : 'rgba(255,255,255,0.08)'}`,
          color: showAwareness ? 'var(--accent-cyan)' : 'rgba(255,255,255,0.45)',
        }}
        aria-label="Awareness"
      >
        {isMobile ? <Zap size={12} /> : 'Awareness'}
      </button>
      <div
        className="flex items-center rounded-full p-0.5"
        style={{ background: 'rgba(8,10,14,0.85)', border: '1px solid rgba(255,255,255,0.08)', backdropFilter: 'blur(8px)' }}
        role="tablist"
        aria-label="Core view"
      >
        {SEGMENTS.map(seg => {
          const active = coreView === seg.id;
          const Icon = seg.icon;
          /* Violet voor Neural, cyaan voor Architecture, neutraal wit voor de
             rest -- dezelfde accenten die de scenes zelf gebruiken. */
          const accent =
            seg.id === 'neural'
              ? { bg: 'rgba(139,92,246,0.28)', border: 'rgba(139,92,246,0.55)', color: '#c4b5fd', glow: '0 0 12px rgba(139,92,246,0.25)' }
              : seg.id === 'runtime'
                ? { bg: 'var(--tint-line)', border: 'var(--tint-line)', color: 'var(--accent-cyan)', glow: '0 0 12px var(--tint-line)' }
                : { bg: 'rgba(255,255,255,0.1)', border: 'rgba(255,255,255,0.14)', color: 'rgba(255,255,255,0.92)', glow: 'none' };
          return (
            <button
              key={seg.id}
              role="tab"
              aria-selected={active}
              onClick={() => setCoreView(seg.id)}
              className="flex items-center gap-1 rounded-full text-[10px] font-medium transition-all"
              style={{
                padding: isMobile ? '6px' : '6px 10px',
                background: active ? accent.bg : 'transparent',
                border: `1px solid ${active ? accent.border : 'transparent'}`,
                color: active ? accent.color : 'rgba(255,255,255,0.38)',
                boxShadow: active ? accent.glow : 'none',
              }}
              aria-label={seg.label}
            >
              {Icon ? <Icon size={11} /> : null}
              {!isMobile && seg.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
