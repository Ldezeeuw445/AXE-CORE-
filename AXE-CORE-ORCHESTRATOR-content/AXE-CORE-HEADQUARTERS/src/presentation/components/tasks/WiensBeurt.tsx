/**
 * Wiens beurt (22 nov, BOUWLIJST): de gedeelde stappenlijst van elke AI in
 * drie kolommen -- Jouw beurt · AI's beurt · Samen -- met per stap waarom.
 * Dezelfde lijst die Claude Code, Codex en Cursor met `axe stap-nieuw` vullen
 * en met `axe stap-af` sluiten; hier sluit Luka zijn eigen stappen met "Af".
 */
import { useCallback, useEffect, useState } from 'react';
import { gedeeldeStappen, stapAf, type GedeeldeStap } from '@/infrastructure/gateways/axeCoreApiService';
import { AXE_AGENTS } from '@/domain/agents/roster';
import { isMacStap } from '@/domain/taken/takenRuis';

function wieNaam(wie: string | null | undefined): string {
  const id = String(wie || '').toLowerCase();
  if (id === 'luka') return 'You';
  if (id === 'samen') return 'Together';
  const a = AXE_AGENTS.find((x) => x.id === id);
  return a ? (a.kort || a.name) : (id || 'AXE');
}

function Kolom({ titel, kleur, stappen, leeg, onAf }: {
  titel: string; kleur: string; stappen: GedeeldeStap[]; leeg: string; onAf?: (s: GedeeldeStap) => void;
}) {
  return (
    <section className="axe-taken-sectie" data-axe-beurt={titel}>
      <header className="flex items-baseline gap-2">
        <h3 className="text-[11px] font-semibold tracking-wide" style={{ color: kleur }}>{titel}</h3>
        <span className="text-[11px] font-mono" style={{ color: 'var(--text-muted)' }}>{stappen.length}</span>
      </header>
      {stappen.length === 0
        ? <p className="mt-2 text-[11px]" style={{ color: 'var(--text-muted)' }}>{leeg}</p>
        : (
          <ul className="mt-2 flex flex-col gap-1.5">
            {stappen.slice(0, 6).map((s) => (
              <li key={s.id ?? s.titel} className="flex items-start gap-2 text-[12px]">
                <div className="min-w-0 flex-1">
                  <div className="truncate" style={{ color: 'var(--text-primary)' }}>{s.titel}</div>
                  {s.waarom ? <div className="truncate text-[10.5px]" style={{ color: 'var(--text-muted)' }}>{s.waarom}</div> : null}
                </div>
                <span className="shrink-0 text-[10px]" style={{ color: 'var(--text-muted)' }}>{wieNaam(s.wie)}</span>
                {onAf && s.is_stap && s.id ? (
                  <button type="button" className="shrink-0 rounded px-1.5 text-[10px]"
                    style={{ border: '1px solid var(--tint-line)', color: 'var(--accent-cyan)' }}
                    onClick={() => onAf(s)}>Done</button>
                ) : null}
              </li>
            ))}
            {stappen.length > 6 && <li className="text-[10px]" style={{ color: 'var(--text-muted)' }}>+{stappen.length - 6} more</li>}
          </ul>
        )}
    </section>
  );
}

export function WiensBeurt() {
  const [st, setSt] = useState<{ jouw_beurt: GedeeldeStap[]; ai_beurt: GedeeldeStap[]; samen: GedeeldeStap[] } | null>(null);
  const laad = useCallback(() => {
    void gedeeldeStappen().then(setSt).catch(() => setSt(null));
  }, []);
  useEffect(() => {
    laad();
    const t = window.setInterval(laad, 60_000);
    return () => window.clearInterval(t);
  }, [laad]);
  /* 25 nov: in het Tasks-dashboard staat dit in een eigen kaart; een lege
     kaart zonder uitleg las als kapot. Geen data = dat zeggen, niets verzinnen. */
  if (!st) return <p className="axe-dash-leeg" data-axe-wiens-beurt="leeg">No shared steps loaded.</p>;
  // Mac-stappen (claude_code.run · AXE Core · imac-3) horen bij hun taak, niet als eigen beurt.
  const aiBeurt = st.ai_beurt.filter((s) => !isMacStap(s.titel ?? ""));
  const af = (s: GedeeldeStap) => {
    if (!s.id) return;
    void stapAf(s.id, 'done by Luka in the Tasks tab').then(laad).catch(laad);
  };
  return (
    <div className="axe-taken-secties mb-4 flex-none" data-axe-wiens-beurt="">
      <Kolom titel="Your turn" kleur="var(--warning)" stappen={st.jouw_beurt} leeg="Nothing waits on you." onAf={af} />
      <Kolom titel="AI's turn" kleur="var(--accent-cyan)" stappen={aiBeurt} leeg="No AI has an open step." onAf={af} />
      <Kolom titel="Together" kleur="var(--success)" stappen={st.samen} leeg="No shared steps." onAf={af} />
    </div>
  );
}
