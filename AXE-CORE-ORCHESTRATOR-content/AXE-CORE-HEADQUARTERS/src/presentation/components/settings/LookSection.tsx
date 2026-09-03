/**
 * De keuze tussen de twee uiterlijke standen.
 *
 * Bewust een keuze en geen migratie: wie niets doet houdt precies de app die
 * hij had. Zie domain/look.ts voor waarom zwart de standaard blijft.
 */
import { useLook } from '@/presentation/hooks/useLook';
import { LOOKS, type Look } from '@/domain/look';

const COPY: Record<Look, { name: string; note: string }> = {
  black: {
    name: 'Zwart',
    note: 'Matzwarte grond, elk paneel met een eigen rand. Zoals AXE altijd was.',
  },
  glass: {
    name: 'Glas',
    note: 'Dezelfde indeling op een plaat met sfeer. De panelen verliezen hun '
        + 'kader omdat de grond het scheiden overneemt.',
  },
};

export function LookSection() {
  const [look, setLook] = useLook();

  return (
    <div className="widget-card" style={{ borderRadius: 'var(--radius)', padding: 16 }}>
      <h3
        className="text-[11px] font-semibold uppercase tracking-[.1em]"
        style={{ color: 'var(--text-muted)' }}
      >
        Uiterlijk
      </h3>

      <p className="mt-2 text-[12px] leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
        Alleen de grond en de randen veranderen. Het lettertype, de
        accentkleuren en de indeling blijven in beide standen hetzelfde, en je
        keuze geldt op al je apparaten.
      </p>

      <div className="mt-3 grid gap-2" style={{ gridTemplateColumns: 'repeat(2, minmax(0, 1fr))' }}>
        {LOOKS.map(id => {
          const active = look === id;
          return (
            <button
              key={id}
              onClick={() => setLook(id)}
              aria-pressed={active}
              className="text-left rounded-lg p-3 transition-colors"
              style={{
                background: active ? 'var(--bg-active)' : 'var(--bg-surface)',
                border: `1px solid ${active ? 'var(--border-active)' : 'var(--border-subtle)'}`,
              }}
            >
              <span
                className="text-[12px] font-medium"
                style={{ color: active ? 'var(--accent-cyan)' : 'var(--text-primary)' }}
              >
                {COPY[id].name}
              </span>
              <span
                className="mt-1 block text-[11px] leading-relaxed"
                style={{ color: 'var(--text-muted)' }}
              >
                {COPY[id].note}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
