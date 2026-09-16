/**
 * Market Intel: de koersen die AXE CORE echt heeft.
 *
 * Dezelfde bron en dezelfde les als de kaartjes bovenin (DeskKaartjes.tsx):
 * fetchMarketSnapshot eindigt, als alle bronnen falen, in een VERZONNEN reeks.
 * `synthetic` is dus "geen prijs", nooit een koers. Nieuws, economische kalender
 * en flows hebben (september 2026) geen bron in AXE; die blokken zeggen dat,
 * in plaats van koppen of cijfers te verzinnen.
 */
import { useEffect, useState } from 'react';
import { LineChart, Newspaper, CalendarDays } from 'lucide-react';
import { TabRail } from '@/presentation/components/layout/useTabRail';
import { fetchMarketSnapshot } from '@/infrastructure/gateways/marketDataService';
import { lseBalken, lseCatalogus } from '@/infrastructure/gateways/lseMarketData';
import { lseSeries } from '@/infrastructure/gateways/lseGateway';
import { binnenBand, koersUitBalken } from '@/domain/northsea/koers';
import { laatsteWaarde, macroRegels, type MacroRegel, type SerieWaarde } from '@/domain/northsea/macro';
import { DetailPaneel, Kengetal, KengetalRij, LegeStaat, Vlak } from './bouwstenen';

interface Markt {
  symbool: string; label: string; eenheid: string; groep: 'Metals' | 'Energy' | 'Macro';
  /* Wat een prijs voor dit ding ongeveer kan zijn.
   *
   * De QA van 16 september vond WTI op 4,12 per vat met +57%: onmogelijk (het
   * vat doet tientallen dollars), maar de tabel toonde het als koers, met een
   * groene pijl erbij. De bron kan een verkeerd symbool voeren of een andere
   * eenheid; wat het ook is, een getal dat niet kan kloppen mag hier niet als
   * koers staan. Buiten deze band tonen we geen prijs en zeggen we waarom. */
  band: readonly [number, number];
}

const MARKTEN: readonly Markt[] = [
  { symbool: 'XCUUSD', label: 'Copper', eenheid: '', groep: 'Metals', band: [1, 20_000] },
  { symbool: 'XAUUSD', label: 'Gold', eenheid: '/ oz', groep: 'Metals', band: [400, 20_000] },
  { symbool: 'XAGUSD', label: 'Silver', eenheid: '/ oz', groep: 'Metals', band: [3, 500] },
  { symbool: 'BCOUSD', label: 'Brent Crude', eenheid: '/ bbl', groep: 'Energy', band: [10, 400] },
  { symbool: 'WTIUSD', label: 'WTI Crude', eenheid: '/ bbl', groep: 'Energy', band: [10, 400] },
  { symbool: 'DXY', label: 'US Dollar Index', eenheid: '', groep: 'Macro', band: [40, 200] },
];

/* Een half uur, niet vijf minuten.
 *
 * LSE's gratis laag geeft TIEN downloads per uur (zie lseMarketData). Zes
 * symbolen elke vijf minuten is 72 per uur: dan is je uur op en staat de tabel
 * leeg -- met een limietfout die eruitziet als een kapotte sleutel. Een half
 * uur past ruim, en dagbalken veranderen niet sneller dan dat. */
const VERVERS_MS = 30 * 60_000;

type Koers = { last: number; pct: number | null; slot: number[]; bron: string } | 'geen' | 'ongeloofwaardig' | null;

/** Een echte koers, of een van de twee redenen waarom hij er niet is. */
const heeftKoers = (k: Koers): k is Exclude<Koers, 'geen' | 'ongeloofwaardig' | null> =>
  k !== null && k !== undefined && k !== 'geen' && k !== 'ongeloofwaardig';

const zonderKoers = (k: Koers) => k === 'geen' || k === 'ongeloofwaardig';

const geenTekst = (k: Koers) => (k === 'ongeloofwaardig' ? 'Price out of range — rejected' : 'No price feed');

function Lijntje({ punten, kleur }: { punten: number[]; kleur: string }) {
  if (punten.length < 2) return null;
  const min = Math.min(...punten);
  const max = Math.max(...punten);
  const b = 96;
  const h = 26;
  const d = punten.map((p, i) => `${i ? 'L' : 'M'}${((i / (punten.length - 1)) * b).toFixed(1)},${(h - ((p - min) / (max - min || 1)) * h).toFixed(1)}`).join('');
  return (
    <svg width={b} height={h} className="overflow-visible" aria-hidden>
      <path d={`${d}L${b},${h}L0,${h}Z`} fill={kleur} opacity={0.12} />
      <path d={d} fill="none" stroke={kleur} strokeWidth={1.4} strokeLinejoin="round" />
    </svg>
  );
}

const prijs = (n: number) => n.toLocaleString('en-US', { maximumFractionDigits: n < 20 ? 4 : 2 });

export function MarktTab() {
  const [koersen, setKoersen] = useState<Record<string, Koers>>({});

  /* LSE eerst, de oude cascade als vangnet.
   *
   * LSE voert de instrumenten die deze desk handelt (XAU/USD, BCO/USD) en is
   * voor AXE Core licentieel in orde: eigen onderzoek, geen doorgifte aan
   * derden. De brokercascade blijft eronder staan voor wat LSE niet heeft --
   * en de band blijft over allebei heen, want een onmogelijke prijs is
   * onmogelijk ongeacht wie hem stuurde. */
  useEffect(() => {
    let weg = false;
    const zet = (symbool: string, k: Koers) => { if (!weg) setKoersen(vorig => ({ ...vorig, [symbool]: k })); };

    const haalEen = async (m: Markt) => {
      try {
        const balken = await lseBalken(m.symbool, 'd1', 30);
        const uitLse = koersUitBalken(balken, 'lse');
        if (uitLse) {
          zet(m.symbool, binnenBand(uitLse.last, m.band) ? uitLse : 'ongeloofwaardig');
          if (!binnenBand(uitLse.last, m.band)) console.warn('[markt] LSE-koers buiten band', m.symbool, uitLse.last);
          return;
        }
      } catch (e) {
        console.warn('[markt] LSE niet bereikbaar, cascade eronder', m.symbool, e);
      }
      try {
        const s = await fetchMarketSnapshot(m.symbool, 'd1', { priority: 'background' });
        const echt = s.source !== 'synthetic' && Number.isFinite(s.last);
        if (!echt) { zet(m.symbool, 'geen'); return; }
        if (!binnenBand(s.last, m.band)) {
          console.warn('[markt] koers buiten band, niet getoond', m.symbool, s.last, s.source);
          zet(m.symbool, 'ongeloofwaardig');
          return;
        }
        zet(m.symbool, { last: s.last, pct: s.changePct ?? null, slot: s.bars.slice(-30).map(b => b.c), bron: String(s.source) });
      } catch {
        zet(m.symbool, 'geen');
      }
    };

    const haal = () => { for (const m of MARKTEN) void haalEen(m); };
    const eerste = setTimeout(haal, 0);
    const iv = setInterval(() => { if (!document.hidden) haal(); }, VERVERS_MS);
    return () => { weg = true; clearTimeout(eerste); clearInterval(iv); };
  }, []);

  /* De macroreeksen: zoeken in de catalogus die de koersen toch al ophalen,
     en alleen de gekozen paar reeksen echt downloaden. Eén keer per sessie --
     een reeks die per kwartaal ververst hoeft niet per minuut opnieuw. */
  const [macro, setMacro] = useState<Array<MacroRegel & { waarde: SerieWaarde | null }> | null>(null);
  useEffect(() => {
    let weg = false;
    void (async () => {
      const cat = await lseCatalogus();
      const regels = macroRegels(cat, undefined, 4);
      if (!regels.length) { if (!weg) setMacro([]); return; }
      const uit = await Promise.all(regels.map(async r => {
        const res = await lseSeries({ series: r.symbol }).catch(() => null);
        return { ...r, waarde: res?.ok ? laatsteWaarde(res.data) : null };
      }));
      if (!weg) setMacro(uit);
    })();
    return () => { weg = true; };
  }, []);

  const met = MARKTEN.filter(m => heeftKoers(koersen[m.symbool]));
  const zonder = MARKTEN.filter(m => zonderKoers(koersen[m.symbool]));

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto px-3 pb-3 pt-2" data-axe-doel="northsea-markt">
      <KengetalRij>
        {MARKTEN.slice(0, 5).map(m => {
          const k = koersen[m.symbool];
          return (
            <Kengetal key={m.symbool} label={m.label}
              waarde={k === null || k === undefined ? '…' : heeftKoers(k) ? prijs(k.last) : '—'}
              sub={heeftKoers(k) && k.pct !== null ? `${k.pct >= 0 ? '+' : ''}${k.pct.toFixed(2)}%` : zonderKoers(k) ? geenTekst(k) : undefined}
              toon={heeftKoers(k) && k.pct !== null ? (k.pct >= 0 ? 'groen' : 'rood') : undefined} />
          );
        })}
      </KengetalRij>

      <Vlak titel={<span className="flex items-center gap-2"><LineChart size={15} style={{ color: '#F472B6' }} />Commodity prices</span>}
        sub={`Daily data from AXE CORE's market data sources · ${met.length} of ${MARKTEN.length} with a live feed`}>
        <table className="w-full table-fixed border-collapse text-[12px]">
          <colgroup><col /><col style={{ width: 90 }} /><col style={{ width: 150 }} /><col style={{ width: 96 }} /><col style={{ width: 130 }} /><col style={{ width: 110 }} /></colgroup>
          <thead>
            <tr>{['Asset', 'Group', 'Price', '24h', 'Last 30 days', 'Source'].map(k => (
              <th key={k} className="truncate px-4 py-1.5 text-left text-[10.5px] font-medium" style={{ color: 'var(--text-muted)' }}>{k}</th>
            ))}</tr>
          </thead>
          <tbody>
            {MARKTEN.map(m => {
              const k = koersen[m.symbool];
              const kleur = heeftKoers(k) && (k.pct ?? 0) < 0 ? '#F87171' : '#34D399';
              return (
                <tr key={m.symbool} style={{ borderTop: '1px solid rgba(255,255,255,0.035)' }}>
                  <td className="truncate px-4 py-2.5" style={{ color: 'var(--text-primary)' }}>{m.label} <span className="font-mono-data text-[10.5px]" style={{ color: 'var(--text-muted)' }}>{m.symbool}</span></td>
                  <td className="truncate px-4 py-2.5" style={{ color: 'var(--text-secondary)' }}>{m.groep}</td>
                  <td className="truncate px-4 py-2.5 tabular-nums" style={{ color: 'var(--text-primary)' }}>
                    {k === null || k === undefined ? <span style={{ color: 'var(--text-muted)' }}>Loading…</span>
                      : !heeftKoers(k) ? <span style={{ color: 'var(--text-muted)' }}>{geenTekst(k)}</span>
                        : <>{prijs(k.last)}{m.eenheid && <span className="ml-1 text-[10.5px]" style={{ color: 'var(--text-muted)' }}>{m.eenheid}</span>}</>}
                  </td>
                  <td className="truncate px-4 py-2.5 tabular-nums" style={{ color: heeftKoers(k) && k.pct !== null ? kleur : 'var(--text-muted)' }}>
                    {heeftKoers(k) && k.pct !== null ? `${k.pct >= 0 ? '+' : ''}${k.pct.toFixed(2)}%` : '—'}
                  </td>
                  <td className="px-4 py-2.5">{heeftKoers(k) ? <Lijntje punten={k.slot} kleur={kleur} /> : null}</td>
                  <td className="truncate px-4 py-2.5 text-[11px]" style={{ color: 'var(--text-muted)' }}>{heeftKoers(k) ? k.bron : '—'}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </Vlak>

      <div className="grid grid-cols-1 gap-3 xl:grid-cols-2">
        <Vlak titel={<span className="flex items-center gap-2"><Newspaper size={15} style={{ color: 'var(--text-secondary)' }} />Key news</span>}>
          <LegeStaat titel="No commodity news source connected"
            uitleg="LSE delivers prices and macro series, but carries no news feed — its vault has candles, series, catalog and reference, and nothing else. Headlines appear here once a news source is connected; none are made up in the meantime." />
        </Vlak>
        {/* Geen "agenda": LSE heeft geen kalender van aankomende gebeurtenissen.
            Wat het wél heeft zijn de reeksen zelf, en de laatste meting is wat
            een desk aan zo'n agenda ontleent. Dus tonen we die, met hun datum. */}
        <Vlak titel={<span className="flex items-center gap-2"><CalendarDays size={15} style={{ color: 'var(--text-secondary)' }} />Macro series · LSE</span>}
          sub="Latest print per series. LSE has no calendar of upcoming events.">
          {macro === null && <LegeStaat titel="Loading macro series…" />}
          {macro?.length === 0 && (
            <LegeStaat titel="No macro series matched"
              uitleg="Nothing in the LSE catalog matched inventories, CPI, PMI, production or freight. The catalog is what it is — nothing is invented to fill this panel." />
          )}
          {macro && macro.length > 0 && (
            <ul className="flex flex-col gap-1.5 px-4 pb-3">
              {macro.map(r => {
                const w = r.waarde;
                const op = w?.vorige !== undefined ? w.waarde - w.vorige : null;
                return (
                  <li key={`${r.dataset}:${r.symbol}`} className="flex items-baseline gap-2 text-[12px]">
                    <span className="min-w-0 flex-1 truncate" style={{ color: 'var(--text-secondary)' }} title={r.naam}>{r.naam}</span>
                    <span className="tabular-nums" style={{ color: 'var(--text-primary)' }}>
                      {w ? w.waarde.toLocaleString('en-US', { maximumFractionDigits: 2 }) : '—'}
                    </span>
                    <span className="w-[54px] text-right tabular-nums text-[11px]"
                      style={{ color: op === null ? 'var(--text-muted)' : op >= 0 ? '#34D399' : '#F87171' }}>
                      {op === null ? '—' : `${op >= 0 ? '+' : ''}${op.toLocaleString('en-US', { maximumFractionDigits: 2 })}`}
                    </span>
                    <span className="w-[72px] text-right text-[10.5px]" style={{ color: 'var(--text-muted)' }}>{w?.datum ?? 'no data'}</span>
                  </li>
                );
              })}
            </ul>
          )}
        </Vlak>
      </div>

      <TabRail kant="rechts">
        <DetailPaneel titel="Watchlist" sub="Commodities relevant to your deals">
          <ul className="flex flex-col gap-2">
            {MARKTEN.map(m => {
              const k = koersen[m.symbool];
              return (
                <li key={m.symbool} className="flex items-center gap-2 text-[12px]">
                  <span className="flex-1 truncate" style={{ color: 'var(--text-secondary)' }}>{m.label}</span>
                  <span className="tabular-nums" style={{ color: 'var(--text-primary)' }}>{heeftKoers(k) ? prijs(k.last) : '—'}</span>
                  <span className="w-[58px] text-right tabular-nums" style={{ color: heeftKoers(k) && k.pct !== null ? ((k.pct ?? 0) >= 0 ? '#34D399' : '#F87171') : 'var(--text-muted)' }}>
                    {heeftKoers(k) && k.pct !== null ? `${k.pct >= 0 ? '+' : ''}${k.pct.toFixed(2)}%` : k === 'ongeloofwaardig' ? 'rejected' : k === 'geen' ? 'no feed' : '…'}
                  </span>
                </li>
              );
            })}
          </ul>
          {zonder.length > 0 && (
            <div className="mt-3 text-[11px]" style={{ color: 'var(--text-muted)' }}>
              No live feed in AXE for: {zonder.map(m => m.label).join(', ')}.
            </div>
          )}
        </DetailPaneel>
      </TabRail>
    </div>
  );
}
