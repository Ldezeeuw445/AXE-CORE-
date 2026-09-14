/**
 * De losse kaartjes bovenin de NorthSea-desk.
 *
 * Geen balk en geen titel: losse tegels die op de plaat zweven, in het
 * materiaal van de nav-tegels (--axe-barbtn, --axe-tegel-op). Past het niet,
 * dan verschijnt links en rechts een pijl en schuift de rij door.
 *
 * ## Marktprijzen, en wanneer níet
 *
 * fetchMarketSnapshot eindigt, als alle bronnen falen, in een VERZONNEN reeks
 * rond 100 (zie de uitleg daar). Op een trading-scherm heeft dat al eens een
 * echte order gekost. Hier geldt dezelfde les: `synthetic` is "geen prijs",
 * en dan staat er "No price feed" in plaats van een koers. Koper en de
 * dollarindex hebben (september 2026) geen bron in AXE; Brent wel (BCOUSD).
 */
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { fetchMarketSnapshot } from '@/infrastructure/gateways/marketDataService';
import type { DeskTellers } from '@/domain/northsea/desk';
import { geld } from '@/domain/northsea/desk';
import type { NorthseaOverzicht } from '@/domain/northsea/chase';

interface Markt {
  symbool: string;
  label: string;
  eenheid?: string;
}

const MARKTEN: Markt[] = [
  { symbool: 'XCUUSD', label: 'Copper' },
  { symbool: 'BCOUSD', label: 'Brent Crude', eenheid: '/ bbl' },
  { symbool: 'DXY', label: 'DXY' },
];

const MARKT_VERVERS_MS = 5 * 60_000;

type Koers = { last: number; pct: number | null; slot: number[] } | 'geen' | null;

const TEGEL_STIJL = {
  background: 'var(--axe-barbtn)',
  boxShadow: 'var(--axe-tegel-op)',
} as const;

function Tegel({ children, breed }: { children: ReactNode; breed?: boolean }) {
  return (
    <div className={`flex h-[74px] shrink-0 snap-start flex-col justify-center rounded-[15px] px-3.5 ${breed ? 'min-w-[196px]' : 'min-w-[132px]'}`}
      style={TEGEL_STIJL}>
      {children}
    </div>
  );
}

function Getal({ waarde, label, sub, kleur, subKleur }: {
  waarde: ReactNode; label: string; sub?: ReactNode; kleur?: string; subKleur?: string;
}) {
  return (
    <Tegel>
      <div className="text-[21px] font-semibold leading-none tabular-nums" style={{ color: kleur ?? 'var(--text-primary)' }}>{waarde}</div>
      <div className="mt-1.5 text-[9.5px] font-semibold uppercase tracking-[0.08em]" style={{ color: 'var(--text-secondary)' }}>{label}</div>
      {sub !== undefined && (
        <div className="mt-0.5 max-w-[170px] truncate text-[10.5px]" style={{ color: subKleur ?? 'var(--text-muted)' }}>{sub}</div>
      )}
    </Tegel>
  );
}

function Lijntje({ punten, kleur }: { punten: number[]; kleur: string }) {
  if (punten.length < 2) return null;
  const min = Math.min(...punten);
  const max = Math.max(...punten);
  const b = 64;
  const h = 24;
  const d = punten.map((p, i) => `${i ? 'L' : 'M'}${((i / (punten.length - 1)) * b).toFixed(1)},${(h - ((p - min) / (max - min || 1)) * h).toFixed(1)}`).join('');
  return (
    <svg width={b} height={h} className="shrink-0 overflow-visible" aria-hidden>
      <path d={`${d}L${b},${h}L0,${h}Z`} fill={kleur} opacity={0.12} />
      <path d={d} fill="none" stroke={kleur} strokeWidth={1.4} strokeLinejoin="round" />
      <circle cx={b} cy={h - ((punten[punten.length - 1] - min) / (max - min || 1)) * h} r={2} fill={kleur} />
    </svg>
  );
}

function MarktTegel({ markt, koers }: { markt: Markt; koers: Koers }) {
  const omhoog = koers && koers !== 'geen' && (koers.pct ?? 0) >= 0;
  const kleur = omhoog ? '#34D399' : '#F87171';
  return (
    <Tegel breed>
      <div className="text-[9.5px] font-semibold uppercase tracking-[0.08em]" style={{ color: 'var(--text-secondary)' }}>{markt.label}</div>
      {koers === null && <div className="mt-2 text-[11px]" style={{ color: 'var(--text-muted)' }}>Loading…</div>}
      {koers === 'geen' && <div className="mt-2 text-[11px]" style={{ color: 'var(--text-muted)' }}>No price feed</div>}
      {koers && koers !== 'geen' && (
        <div className="mt-1 flex items-end justify-between gap-3">
          <div>
            <div className="text-[16px] font-semibold leading-tight tabular-nums" style={{ color: 'var(--text-primary)' }}>
              {koers.last.toLocaleString('en-US', { maximumFractionDigits: koers.last < 20 ? 4 : 2 })}
              {markt.eenheid && <span className="ml-1 text-[10.5px] font-normal" style={{ color: 'var(--text-muted)' }}>{markt.eenheid}</span>}
            </div>
            {koers.pct !== null && (
              <div className="text-[11px] tabular-nums" style={{ color: kleur }}>{koers.pct >= 0 ? '+' : ''}{koers.pct.toFixed(2)}%</div>
            )}
          </div>
          <Lijntje punten={koers.slot} kleur={kleur} />
        </div>
      )}
    </Tegel>
  );
}

export function DeskKaartjes({ data, tellers, routes }: {
  data: NorthseaOverzicht | null;
  tellers: DeskTellers | null;
  routes: number | null;
}) {
  const rijRef = useRef<HTMLDivElement | null>(null);
  const [randen, setRanden] = useState({ links: false, rechts: false });
  const [koersen, setKoersen] = useState<Record<string, Koers>>({});

  useEffect(() => {
    const rij = rijRef.current;
    if (!rij) return;
    const meet = () => setRanden({
      links: rij.scrollLeft > 2,
      rechts: rij.scrollLeft + rij.clientWidth < rij.scrollWidth - 2,
    });
    meet();
    const ro = new ResizeObserver(meet);
    ro.observe(rij);
    rij.addEventListener('scroll', meet, { passive: true });
    return () => { ro.disconnect(); rij.removeEventListener('scroll', meet); };
  }, []);

  useEffect(() => {
    let weg = false;
    const haal = () => {
      for (const m of MARKTEN) {
        fetchMarketSnapshot(m.symbool, 'd1', { priority: 'background' })
          .then(s => {
            const echt = s.source !== 'synthetic' && Number.isFinite(s.last);
            const slot = s.bars.slice(-30).map(b => b.c);
            if (!weg) setKoersen(k => ({ ...k, [m.symbool]: echt ? { last: s.last, pct: s.changePct ?? null, slot } : 'geen' }));
          })
          .catch(() => { if (!weg) setKoersen(k => ({ ...k, [m.symbool]: 'geen' })); });
      }
    };
    const eerste = setTimeout(haal, 0);
    const iv = setInterval(() => { if (!document.hidden) haal(); }, MARKT_VERVERS_MS);
    return () => { weg = true; clearTimeout(eerste); clearInterval(iv); };
  }, []);

  const schuif = (richting: 1 | -1) => {
    const rij = rijRef.current;
    if (rij) rij.scrollBy({ left: richting * rij.clientWidth * 0.7, behavior: 'smooth' });
  };

  const leeg = '—';
  const pijl = (richting: 1 | -1, zichtbaar: boolean) => (
    <button type="button" onClick={() => schuif(richting)} aria-label={richting < 0 ? 'Scroll cards left' : 'Scroll cards right'}
      className="pointer-events-auto flex h-8 w-8 shrink-0 items-center justify-center rounded-full transition-opacity"
      style={{ ...TEGEL_STIJL, color: 'var(--text-secondary)', opacity: zichtbaar ? 1 : 0, visibility: zichtbaar ? 'visible' : 'hidden' }}>
      {richting < 0 ? <ChevronLeft size={15} /> : <ChevronRight size={15} />}
    </button>
  );

  return (
    <div className="pointer-events-none absolute inset-x-0 top-2 z-10 flex items-center gap-2 px-3" data-axe-doel="northsea-kaartjes">
      {pijl(-1, randen.links)}
      <div ref={rijRef} className="ns-kaartrij pointer-events-auto flex min-w-0 flex-1 snap-x gap-3 overflow-x-auto px-2 py-3">
        <Getal waarde={tellers?.actief ?? leeg} label="Active deals" kleur="#22D3EE"
          sub={tellers ? `+${tellers.nieuwDezeWeek} this week` : undefined} subKleur="#34D399" />
        <Getal waarde={tellers?.akkoord ?? leeg} label="Awaiting approval" kleur="#FBBF24"
          sub={tellers ? (tellers.akkoordNamen.join(', ') || 'Nothing waiting') : undefined}
          subKleur={tellers?.akkoord ? '#22D3EE' : undefined} />
        <Getal waarde={tellers?.geblokkeerd ?? leeg} label="Blocked" kleur="#F87171"
          sub={tellers ? (tellers.geblokkeerd ? 'Action required' : 'Nothing blocked') : undefined} />
        <Getal waarde={tellers?.commissie != null ? geld(tellers.commissie) : leeg} label="Potential commission"
          sub={tellers ? (tellers.commissie != null ? `${tellers.commissieDeals} deals with an amount` : 'No amounts on deals yet') : undefined} />
        <Getal waarde={data?.tellers.bedrijven ?? leeg} label="Counterparties"
          sub={data ? `${data.tellers.communicatie_7d} messages · 7d` : undefined} />
        <Getal waarde={routes ?? leeg} label="Active routes" sub={routes !== null ? 'On the map' : undefined} />
        {MARKTEN.map(m => <MarktTegel key={m.symbool} markt={m} koers={koersen[m.symbool] ?? null} />)}
      </div>
      {pijl(1, randen.rechts)}
      <style>{`
        .ns-kaartrij { scrollbar-width: none; }
        .ns-kaartrij::-webkit-scrollbar { display: none; }
      `}</style>
    </div>
  );
}
