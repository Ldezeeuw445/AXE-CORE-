/**
 * MobileStatsRow — de drie kerncijfers onder de sphere, zoals de Tauri-mockup
 * van het AXE COMMAND CENTER: MEMORIES · BRAIN NODES · INTEGRITY.
 *
 * Alleen op de telefoon-home, en alleen als de chat is ingeklapt: dan is de
 * sphere de baas en past er een rustige cijferregel onder. Zodra het gesprek
 * openklapt neemt dat de ruimte over en verdwijnt de regel, zodat er nooit twee
 * dingen om dezelfde plek vechten.
 *
 * De cijfers komen 1-op-1 uit `useGlobalMemoryStats` — dezelfde bron als de
 * Neural-view. Niets wordt hier verzonnen; bij een lege/onbereikbare store staat
 * er een streepje in plaats van een nul die zekerheid voorwendt.
 */
import { useGlobalMemoryStats } from '@/presentation/components/axe-core/useGlobalMemoryStats';
import { useChatCollapsed } from '@/presentation/store/coreViewStore';
import { useIsMobile } from '@/presentation/hooks/use-mobile';

function fmt(n: number): string {
  if (n >= 1000) return `${(n / 1000).toFixed(n >= 10000 ? 0 : 1)}k`;
  return String(n);
}

export function MobileStatsRow() {
  const { total, connections, integrityPct, loading } = useGlobalMemoryStats();
  const isMobile = useIsMobile();
  const collapsed = useChatCollapsed(isMobile);

  // De regel hoort bij de schone, ingeklapte home. Staat de chat open, dan is de
  // ruimte van het gesprek en niet van de cijfers. Dezelfde afgeleide stand als
  // de chat, zodat ze nooit tegelijk zichtbaar zijn.
  if (!collapsed) return null;

  const stats: Array<{ label: string; value: string }> = [
    { label: 'MEMORIES', value: loading ? '…' : fmt(total) },
    { label: 'BRAIN NODES', value: loading ? '…' : fmt(connections) },
    { label: 'INTEGRITY', value: integrityPct == null ? '—' : `${integrityPct}%` },
  ];

  return (
    // Zwevend, midden onder de sphere en net boven de ingeklapte composer.
    <div
      className="fixed left-1/2 z-[60] -translate-x-1/2 pointer-events-none"
      style={{ bottom: 'calc(env(safe-area-inset-bottom, 0px) + 120px)' }}
    >
      <div
        className="flex items-stretch rounded-2xl px-1 py-2"
        style={{
          background: 'rgba(12,14,20,0.42)',
          backdropFilter: 'blur(24px) saturate(150%)',
          WebkitBackdropFilter: 'blur(24px) saturate(150%)',
          border: '1px solid rgba(255,255,255,0.08)',
          boxShadow: '0 8px 30px rgba(0,0,0,0.35)',
        }}
      >
        {stats.map((s, i) => (
          <div
            key={s.label}
            className="flex flex-col items-center px-4"
            style={i > 0 ? { borderLeft: '1px solid rgba(255,255,255,0.08)' } : undefined}
          >
            <span className="font-mono text-[17px] font-semibold leading-none" style={{ color: 'var(--accent-cyan)' }}>
              {s.value}
            </span>
            <span className="mt-1 text-[8px] font-medium tracking-[0.12em]" style={{ color: 'var(--text-muted)' }}>
              {s.label}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
