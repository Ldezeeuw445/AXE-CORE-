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
 * en dan staat er "No price feed" in plaats van een koers.
 *
 * 24 nov: koper en DXY kwamen nooit binnen (stooq: CORS in de browser, en nu een
 * bot-controle), en Brent toonde 100,31 terwijl de Brent-future op 86,60 stond.
 * Nu alle drie via de VPS (`/market/daily`, Yahoo, server-side). Geen prijs = "No
 * price feed", nooit een gok.
 */
import { useEffect, useState, type ReactNode } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';
import { deskDagkoers } from '@/infrastructure/gateways/axeCoreApiService';
import type { DeskTellers } from '@/domain/northsea/desk';
import { geld } from '@/domain/northsea/desk';
import { tijdGeleden, type ChaseItem, type NorthseaOverzicht } from '@/domain/northsea/chase';
import { activiteitPerDag } from '@/domain/northsea/deskKpi';

interface Markt {
  symbool: string;
  label: string;
  eenheid?: string;
}

const MARKTEN: Array<Markt & { symbool: 'XCUUSD' | 'BCOUSD' | 'DXY' }> = [
  { symbool: 'XCUUSD', label: 'Copper', eenheid: '/ lb' },
  { symbool: 'BCOUSD', label: 'Brent Crude', eenheid: '/ bbl' },
  { symbool: 'DXY', label: 'DXY' },
];

const MARKT_VERVERS_MS = 5 * 60_000;

type Koers = { last: number; pct: number | null; slot: number[] } | 'geen' | null;

const TEGEL_STIJL = {
  background: 'var(--axe-barbtn)',
  boxShadow: 'var(--axe-tegel-op)',
} as const;

function Tegel({ children }: { children: ReactNode; breed?: boolean }) {
  return (
    /* Smal gehouden zodat de hele rij op een gewoon venster past en in het
       midden staat: gemeten op 2000 breed was hij met 196/132 net 30px te breed
       voor zijn ruimte (1526 in 1496), en dan schoof hij en stond er een pijl. */
    /* 25 nov: geen vaste breedte meer -- de tegels staan in een raster van
       gelijke kolommen dat precies de breedte van de desk vult (geen schuifrij). */
    <div className="flex h-[74px] w-full min-w-0 flex-col justify-center rounded-[15px] px-3"
      style={TEGEL_STIJL}>
      {children}
    </div>
  );
}

function Getal({ waarde, label, sub, kleur, subKleur, onKies }: {
  waarde: ReactNode; label: string; sub?: ReactNode; kleur?: string; subKleur?: string; onKies?: () => void;
}) {
  const inhoud = (
    <>
      <div className="text-[21px] font-semibold leading-none tabular-nums" style={{ color: kleur ?? 'var(--text-primary)' }}>{waarde}</div>
      <div className="mt-1.5 truncate text-[9.5px] font-semibold uppercase tracking-[0.08em]" style={{ color: 'var(--text-secondary)' }} title={label}>{label}</div>
      {sub !== undefined && (
        <div className="mt-0.5 max-w-full truncate text-[10.5px]" style={{ color: subKleur ?? 'var(--text-muted)' }}>{sub}</div>
      )}
    </>
  );
  if (!onKies) return <Tegel>{inhoud}</Tegel>;
  return (
    <button type="button" onClick={onKies} className="min-w-0 text-left">
      <Tegel>{inhoud}</Tegel>
    </button>
  );
}

function Lijntje({ punten, kleur }: { punten: number[]; kleur: string }) {
  if (punten.length < 2) return null;
  const min = Math.min(...punten);
  const max = Math.max(...punten);
  const b = 52;
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

/**
 * "Do next" (25 nov): de drie bovenste punten uit AXE Chase als knoppen, plus
 * hoeveel er de laatste 14 dagen bij kwam. Eén regel hoog, onder de tegels;
 * de kaart blijft vrij. Leeg = "Nothing to chase", geen verzonnen taak.
 */
function DoeNu({ data, items, nu, kies, alles }: {
  data: NorthseaOverzicht | null; items: readonly ChaseItem[]; nu: number; kies: (i: ChaseItem) => void; alles: () => void;
}) {
  const reeks = data ? activiteitPerDag([...data.acties, ...data.taken, ...data.concepten, ...data.bounces], nu) : [];
  const som = reeks.reduce((a, b) => a + b, 0);
  const kleur = (t: ChaseItem['toon']) => (t === 'rood' ? '#F87171' : t === 'amber' ? '#FBBF24' : '#34D399');
  return (
    <div className="ns-doenu mt-2.5 grid gap-2.5" style={{ gridTemplateColumns: 'repeat(8, minmax(0, 1fr))' }} data-axe-ns-doenu="">
      <div className="col-span-6 flex h-[38px] min-w-0 items-center gap-2 rounded-[13px] px-3" style={TEGEL_STIJL}>
        <span className="shrink-0 text-[9.5px] font-semibold uppercase tracking-[0.08em]" style={{ color: 'var(--text-secondary)' }}>Do next</span>
        {!data && <span className="text-[11px]" style={{ color: 'var(--text-muted)' }}>Loading…</span>}
        {data && items.length === 0 && <span className="text-[11px]" style={{ color: 'var(--text-muted)' }}>Nothing to chase.</span>}
        {items.slice(0, 3).map(i => (
          <button key={i.id} type="button" onClick={() => kies(i)} title={`${i.kop} — ${i.regel}`}
            className="flex min-w-0 flex-1 items-center gap-1.5 rounded-lg px-2 py-1 text-left text-[11px] hover:bg-white/5">
            <i className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: kleur(i.toon) }} aria-hidden />
            <span className="truncate" style={{ color: 'var(--text-primary)' }}>{i.kop}</span>
            <span className="shrink-0 text-[10px]" style={{ color: 'var(--text-muted)' }}>{i.stand} · {tijdGeleden(i.wanneer, nu)}</span>
          </button>
        ))}
        {items.length > 0 && (
          <button type="button" onClick={alles} className="ml-auto shrink-0 rounded-full px-2.5 py-0.5 text-[10px]"
            style={{ color: 'var(--text-secondary)', border: '1px solid rgba(255,255,255,0.1)' }}>
            All {items.length}
          </button>
        )}
      </div>
      <div className="col-span-2 flex h-[38px] min-w-0 items-center justify-between gap-2 rounded-[13px] px-3" style={TEGEL_STIJL}
        title="New actions, tasks, drafts and bounces per day, last 14 days">
        <span className="min-w-0">
          <span className="block truncate text-[9.5px] font-semibold uppercase tracking-[0.08em]" style={{ color: 'var(--text-secondary)' }}>Activity · 14d</span>
          <span className="text-[13px] font-semibold tabular-nums" style={{ color: 'var(--text-primary)' }}>{data ? som : '—'}</span>
        </span>
        {som > 0 ? <Lijntje punten={reeks} kleur="#22D3EE" /> : <span className="text-[10px]" style={{ color: 'var(--text-muted)' }}>{data ? 'No new items' : ''}</span>}
      </div>
    </div>
  );
}

export function DeskKaartjes({ data, tellers, routes, kies, volgende }: {
  data: NorthseaOverzicht | null;
  tellers: DeskTellers | null;
  routes: number | null;
  /** AXE Chase-punten voor de "Do next"-regel; zonder dit geen regel. */
  volgende?: { items: readonly ChaseItem[]; nu: number; kies: (i: ChaseItem) => void; alles: () => void };
  kies?: {
    actief?: () => void;
    akkoord?: () => void;
    /** Pending drafts: daar waar je ze echt kunt versturen ("Wacht op jou"). */
    concepten?: () => void;
    geblokkeerd?: () => void;
    bounces?: () => void;
    afgerond?: () => void;
    tegenpartijen?: () => void;
  };
}) {
  /* 25 nov (Luka: niet scrollen): de rij schoof zijwaarts met pijlen en
     knipte "Counterparties" af. Nu zeven kerncijfers + "More" in één raster
     van gelijke kolommen; More klapt de tweede rij (commissie, routes,
     markten) open over de kaart, in hetzelfde raster. */
  const [meer, setMeer] = useState(false);
  const [koersen, setKoersen] = useState<Record<string, Koers>>({});

  useEffect(() => {
    let weg = false;
    const haal = () => {
      for (const m of MARKTEN) {
        deskDagkoers(m.symbool)
          .then(s => {
            const echt = s.ok && typeof s.last === 'number' && Number.isFinite(s.last);
            const slot = (s.bars ?? []).slice(-30).map(b => b.c);
            if (!weg) setKoersen(k => ({ ...k, [m.symbool]: echt ? { last: s.last as number, pct: s.changePct ?? null, slot } : 'geen' }));
          })
          .catch(() => { if (!weg) setKoersen(k => ({ ...k, [m.symbool]: 'geen' })); });
      }
    };
    const eerste = setTimeout(haal, 0);
    const iv = setInterval(() => { if (!document.hidden) haal(); }, MARKT_VERVERS_MS);
    return () => { weg = true; clearTimeout(eerste); clearInterval(iv); };
  }, []);

  const leeg = '—';

  return (
    <div className="pointer-events-none absolute inset-x-0 top-2 z-10 px-5 py-3" data-axe-doel="northsea-kaartjes">
      <div className="ns-kaartrij pointer-events-auto grid gap-2.5" style={{ gridTemplateColumns: 'repeat(8, minmax(0, 1fr))' }} data-axe-gelijk="northsea-kpi">
        <Getal waarde={tellers?.actief ?? leeg} label="Active deals" kleur="#22D3EE"
          sub={tellers ? `+${tellers.nieuwDezeWeek} this week` : undefined} subKleur="#34D399" onKies={kies?.actief} />
        <Getal waarde={tellers?.akkoord ?? leeg} label="Awaiting OK" kleur="#FBBF24"
          sub={tellers ? (tellers.akkoordNamen.join(', ') || 'Nothing waiting') : undefined}
          subKleur={tellers?.akkoord ? '#22D3EE' : undefined} onKies={kies?.akkoord} />
        <Getal waarde={data ? (data.concepten?.length ?? 0) : leeg} label="Drafts" kleur="#FBBF24"
          sub={data ? ((data.concepten?.length ?? 0) ? 'Send in Waiting on you' : 'None waiting') : undefined} onKies={kies?.concepten ?? kies?.akkoord} />
        <Getal waarde={tellers?.geblokkeerd ?? leeg} label="Blocked" kleur="#F87171"
          sub={tellers ? (tellers.geblokkeerd ? 'Action required' : 'Nothing blocked') : undefined} onKies={kies?.geblokkeerd} />
        <Getal waarde={data ? (data.bounces?.length ?? 0) : leeg} label="Bounced" kleur="#F87171"
          sub={data ? ((data.bounces?.length ?? 0) ? 'Last 30 days' : 'None in 30 days') : undefined} onKies={kies?.bounces} />
        <Getal waarde={tellers?.afgerond ?? leeg} label="Closed"
          sub={tellers ? (tellers.afgerond ? 'Won / completed' : 'None closed yet') : undefined} onKies={kies?.afgerond} />
        <Getal waarde={data?.tellers.bedrijven ?? leeg} label="Companies"
          sub={data ? `${data.tellers.communicatie_7d} messages · 7d` : undefined} onKies={kies?.tegenpartijen} />
        <button type="button" className="min-w-0 text-left" onClick={() => setMeer(v => !v)} aria-expanded={meer} data-axe-ns-meer="">
          <Tegel>
            <div className="flex items-center gap-1 text-[21px] font-semibold leading-none" style={{ color: 'var(--text-primary)' }}>
              {2 + MARKTEN.length}{meer ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
            </div>
            <div className="mt-1.5 truncate text-[9.5px] font-semibold uppercase tracking-[0.08em]" style={{ color: 'var(--text-secondary)' }}>More</div>
            <div className="mt-0.5 truncate text-[10.5px]" style={{ color: 'var(--text-muted)' }}>Commission · routes · markets</div>
          </Tegel>
        </button>
        {meer && (
          <>
            <Getal waarde={tellers?.commissie != null ? geld(tellers.commissie) : leeg} label="Commission"
              sub={tellers ? (tellers.commissie != null ? `${tellers.commissieDeals} deals with an amount` : 'No amounts yet') : undefined} />
            <Getal waarde={routes ?? leeg} label="Active routes" sub={routes !== null ? 'On the map' : undefined} />
            {MARKTEN.map(m => <div key={m.symbool} className="col-span-2 min-w-0"><MarktTegel markt={m} koers={koersen[m.symbool] ?? null} /></div>)}
          </>
        )}
      </div>
      {volgende && !meer && (
        <div className="pointer-events-auto">
          <DoeNu data={data} items={volgende.items} nu={volgende.nu} kies={volgende.kies} alles={volgende.alles} />
        </div>
      )}
    </div>
  );
}
