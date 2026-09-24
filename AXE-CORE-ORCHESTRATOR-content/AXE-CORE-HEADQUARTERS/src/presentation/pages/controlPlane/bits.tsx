/**
 * Twee bouwstenen die elk blok van de Control Plane deelt.
 *
 * Stand: een toestand in de LETTERS plus een stip, nooit in een vlak
 * (UI-MAATSTAF regel 5). De kleur komt uit de betekenistokens --m-*, zodat
 * "stuk" hier hetzelfde rood is als in het grootboek.
 *
 * Bevestig: elke knop die iets verandert vraagt een tweede klik op dezelfde
 * plek. Geen window.confirm -- die hangt in een Tauri-webview van de
 * dialoogplug-in af -- en geen modaal venster voor één regel.
 */
import { useEffect, useState, type ReactNode } from 'react';

export type Toon = 'ok' | 'bad' | 'warn' | 'info' | 'muted';

const KLEUR: Record<Toon, string> = {
  ok: 'var(--m-happened)',
  bad: 'var(--m-broken)',
  warn: 'var(--m-budget)',
  info: 'var(--m-structure)',
  muted: 'var(--text-muted)',
};

export function Stand({ toon, children, title }: { toon: Toon; children: ReactNode; title?: string }) {
  return (
    <span className="cp-stand" style={{ color: KLEUR[toon] }} title={title}>
      <i className="cp-stip" style={{ background: KLEUR[toon] }} />
      {children}
    </span>
  );
}

export function Bevestig({
  label, vraag, doe, uit, uitReden, toon = 'info',
}: {
  label: string;
  /** Wat er op de tweede klik staat, bijv. "Run mt5-sync now?" */
  vraag: string;
  doe: () => Promise<void>;
  uit?: boolean;
  uitReden?: string;
  toon?: Toon;
}) {
  const [fase, setFase] = useState<'rust' | 'vraag' | 'bezig'>('rust');

  // Een open vraag die je laat staan, klapt na acht seconden terug.
  useEffect(() => {
    if (fase !== 'vraag') return;
    const t = setTimeout(() => setFase('rust'), 8000);
    return () => clearTimeout(t);
  }, [fase]);

  if (fase === 'rust') {
    return (
      <button type="button" className="cp-knop" style={{ color: uit ? 'var(--text-muted)' : KLEUR[toon] }}
        disabled={uit} title={uit ? uitReden : undefined} onClick={() => setFase('vraag')}>
        {label}
      </button>
    );
  }
  return (
    <span className="cp-vraag">
      <span style={{ color: 'var(--text-secondary)' }}>{fase === 'bezig' ? 'Working…' : vraag}</span>
      <button type="button" className="cp-knop" style={{ color: KLEUR[toon] }} disabled={fase === 'bezig'}
        onClick={() => { setFase('bezig'); void doe().finally(() => setFase('rust')); }}>
        Confirm
      </button>
      <button type="button" className="cp-knop" style={{ color: 'var(--text-muted)' }} disabled={fase === 'bezig'}
        onClick={() => setFase('rust')}>
        No
      </button>
    </span>
  );
}

/** Een getal met zijn naam eronder, voor de tellers bovenaan. */
export function Teller({ label, waarde, onder, toon = 'info' }: { label: string; waarde: ReactNode; onder?: ReactNode; toon?: Toon }) {
  return (
    <div className="widget-card flex min-h-0 flex-col justify-center overflow-hidden px-4 py-3" style={{ borderRadius: 'var(--radius)' }}>
      <div className="text-[10px] font-semibold uppercase tracking-[.1em]" style={{ color: 'var(--text-muted)' }}>{label}</div>
      <div className="mt-1 font-mono-data text-[22px] font-semibold leading-none" style={{ color: KLEUR[toon] }}>{waarde}</div>
      {onder && <div className="mt-1.5 truncate text-[11px]" style={{ color: 'var(--text-muted)' }}>{onder}</div>}
    </div>
  );
}
