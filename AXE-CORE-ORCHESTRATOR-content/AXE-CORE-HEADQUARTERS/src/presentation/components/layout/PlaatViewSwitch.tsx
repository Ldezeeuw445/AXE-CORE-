/**
 * De balk midden boven: Awareness, Core, Neural, Terrain, Architecture.
 *
 * ## Waarom dit in de schil zit en niet op Home
 *
 * Dit stond in Home, dus het bestond alleen daar. Ga je naar een andere tab,
 * dan is de weg terug naar Terrain of Neural weg -- terwijl dit juist de
 * snelste route ertussen is. Het hoort bij de plaat, net als de klok en de
 * navigatie onderin.
 *
 * De stand woont in coreViewStore, want twee plekken die dezelfde stand
 * bijhouden lopen gegarandeerd uit elkaar.
 *
 * ## Eén balk, en dezelfde als onderin
 *
 * Het waren vier dingen naast elkaar: twee tellers, een losse Awareness-pil en
 * een groepje van vier. Vier vormen voor één rij, en de tellers stonden ertussen
 * terwijl ze geen navigatie zijn -- die staan nu in het meldingenpaneel, waar
 * je naar cijfers gaat kijken.
 *
 * Awareness hoort er wél bij: het is net zo goed "wat zie ik in het midden".
 * Daarom staat hij nu ín de balk in plaats van ernaast.
 *
 * En hij ziet eruit als de onderbalk: dezelfde tegels, hetzelfde reliëf, en de
 * actieve blijft INGEDRUKT. Dat is de vorm die deze app al heeft voor "kies er
 * één uit een rij"; er hoefde er geen tweede bij verzonnen te worden.
 */
import { BrainCircuit, Eye, Mountain, Network, Sparkles } from 'lucide-react';
import { useIsMobile } from '@/presentation/hooks/use-mobile';
import { useCoreViewStore, type CoreView } from '@/presentation/store/coreViewStore';

const SEGMENTS: Array<{ id: CoreView; label: string; icon: typeof BrainCircuit }> = [
  { id: 'axe', label: 'Core', icon: Sparkles },
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
    <div className="axe-viewctl over-canvas-group" role="tablist" aria-label="Core view">
      {/* Awareness staat apart van de vier: hij zet iets OPEN en de rest kiest
          wat er in het midden staat. Zelfde tegel, eigen groepje, met een
          streepje ertussen -- zoals de `+` in de composer. */}
      <button
        className="axe-viewknop"
        data-aan={showAwareness ? 'ja' : undefined}
        onClick={() => setShowAwareness(!showAwareness)}
        aria-pressed={showAwareness}
        aria-label="Awareness"
        title="Awareness"
      >
        <Eye size={13} />
        {!isMobile && <span>Awareness</span>}
      </button>

      <span className="axe-viewstreep" aria-hidden="true" />

      {SEGMENTS.map(seg => {
        const active = coreView === seg.id;
        const Icon = seg.icon;
        return (
          <button
            key={seg.id}
            role="tab"
            aria-selected={active}
            className="axe-viewknop"
            data-aan={active ? 'ja' : undefined}
            onClick={() => setCoreView(seg.id)}
            aria-label={seg.label}
            title={seg.label}
          >
            <Icon size={13} />
            {!isMobile && <span>{seg.label}</span>}
          </button>
        );
      })}
    </div>
  );
}
