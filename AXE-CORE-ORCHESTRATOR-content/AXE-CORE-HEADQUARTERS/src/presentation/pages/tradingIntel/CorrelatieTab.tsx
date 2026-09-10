/**
 * CorrelatieTab — welke paren samen bewegen, en wat dat betekent voor je risico.
 *
 * ## Waarom dit op het bureau hoort
 *
 * Twee posities die op 0,9 lopen zijn één positie met dubbele inzet. Dat is
 * niet zichtbaar in een lijst met open trades: die toont XAUUSD en XAGUSD als
 * twee regels, en het scherm zegt nergens dat ze hetzelfde doen. Spreiding die
 * geen spreiding is, is de duurste vorm van gerustheid.
 *
 * ## Voor Luka én voor de agents, uit dezelfde berekening
 *
 * De matrix hieronder en de tekst die de agents in hun context krijgen komen
 * allebei uit `domain/tradingIntel/correlatie.ts`. Eén berekening, twee
 * lezers. Een paneel dat zijn eigen cijfers uitrekent gaat vroeg of laat iets
 * anders zeggen dan de agent die ernaast handelt, en dan is niet te zien wie
 * gelijk heeft.
 *
 * ## Wat een leeg vakje betekent
 *
 * Niet "geen samenhang" maar "te weinig gedeelde punten om iets te zeggen" —
 * goud handelt niet in het weekend, crypto wel. Dat verschil staat er
 * expliciet bij, want een 0 die eigenlijk "onbekend" is, is precies het soort
 * cijfer waar je een positie op neemt die je niet had moeten nemen.
 */
import { useCallback, useEffect, useState } from 'react';
import { RefreshCw, GitCompareArrows } from 'lucide-react';
import { WidgetCard } from '@/presentation/components/widgets/WidgetCard';
import { lseBalken } from '@/infrastructure/gateways/lseMarketData';
import type { OhlcBar } from '@/domain/tradingIntel/demoTypes';
import {
  bouwCorrelatieMatrix, correlatieVoorAgent, MIN_OVERLAP,
  type CorrelatieMatrix,
} from '@/domain/tradingIntel/correlatie';

/**
 * Bewust een korte lijst en niet alle zeventien paren. De gratis laag van LSE
 * geeft tien downloads per uur; zeventien symbolen zijn zeventien aanroepen en
 * daarmee is je uur op na één klik. Dit zijn de paren waar de desk werkelijk
 * in zit.
 *
 * USDJPY en USDCHF staan er niet voor de volledigheid maar voor de hedge-kolom.
 * De eerste zes zijn allemaal X/USD — de dollar staat bij alle zes aan dezelfde
 * kant, dus komt er nauwelijks een min-teken uit en bleef die kolom leeg. Met de
 * dollar aan de ándere kant meet je hem wél, en pas dan zegt "loopt tegengesteld"
 * iets.
 */
const STANDAARD = [
  'XAUUSD', 'XAGUSD', 'EURUSD', 'GBPUSD', 'BTCUSD', 'US500', 'USDJPY', 'USDCHF',
];

const TIMEFRAMES = ['M15', 'H1', 'H4', 'D1'] as const;
type Timeframe = (typeof TIMEFRAMES)[number];

/**
 * Balken die al opgehaald zijn, per symbool én timeframe.
 *
 * Zonder dit kost elke wissel van timeframe de hele lijst opnieuw: acht
 * symbolen, en na de tweede klik is je uur op bij tien downloads. Een correlatie
 * over tweehonderd balken verandert niet in een kwartier, dus een kwartier
 * bewaren kost geen nauwkeurigheid en scheelt het verschil tussen "één keer
 * kijken per uur" en "rondklikken".
 *
 * Buiten de component, zodat hij een tabwissel overleeft — teruggaan naar
 * Correlatie hoort geen download te kosten. Ververs slaat hem expliciet over:
 * wie op die knop drukt vraagt om verse data, niet om wat er lag.
 */
const CACHE = new Map<string, { opgehaaldOp: number; bars: OhlcBar[] | null }>();
const CACHE_TTL_MS = 15 * 60_000;

async function haalBalken(
  sym: string,
  timeframe: Timeframe,
  vers: boolean,
): Promise<{ bars: OhlcBar[] | null; uitCache: boolean }> {
  const sleutel = `${sym}|${timeframe}`;
  const gezet = CACHE.get(sleutel);
  if (!vers && gezet && Date.now() - gezet.opgehaaldOp < CACHE_TTL_MS) {
    return { bars: gezet.bars, uitCache: true };
  }

  const bars = await lseBalken(sym, timeframe, 200).catch(() => null);
  // Ook een leeg antwoord wordt bewaard: een symbool dat LSE niet voert blijft
  // dat een kwartier lang, en het elke klik opnieuw vragen kost quotum voor een
  // antwoord dat je al kent.
  CACHE.set(sleutel, { opgehaaldOp: Date.now(), bars });
  return { bars, uitCache: false };
}

/** Blauw voor samen, rood voor tegengesteld, dieper naarmate het sterker is. */
function kleurVoor(r: number | null): string {
  if (r === null) return 'rgba(255,255,255,0.03)';
  const sterkte = Math.min(1, Math.abs(r));
  const alpha = 0.08 + sterkte * 0.42;
  return r >= 0
    ? `rgba(56, 160, 220, ${alpha})`
    : `rgba(220, 80, 80, ${alpha})`;
}

export function CorrelatieTab() {
  const [timeframe, setTimeframe] = useState<Timeframe>('H1');
  const [matrix, setMatrix] = useState<CorrelatieMatrix | null>(null);
  const [busy, setBusy] = useState(false);
  const [fout, setFout] = useState<string | null>(null);
  const [gemist, setGemist] = useState<string[]>([]);
  const [op, setOp] = useState<string | null>(null);
  const [downloads, setDownloads] = useState(0);

  const laad = useCallback(async (vers: boolean) => {
    setBusy(true);
    setFout(null);

    try {
      // Serieel, niet parallel: acht gelijktijdige aanroepen tegen een bron met
      // tien downloads per uur is de snelste manier om je quotum op te maken
      // aan één klik.
      const reeksen: Record<string, OhlcBar[] | null> = {};
      const misten: string[] = [];
      let live = 0;
      for (const sym of STANDAARD) {
        const { bars, uitCache } = await haalBalken(sym, timeframe, vers);
        if (!uitCache) live++;
        reeksen[sym] = bars;
        if (!bars?.length) misten.push(sym);
      }

      setGemist(misten);
      setDownloads(live);
      setMatrix(bouwCorrelatieMatrix(reeksen));
      setOp(new Date().toLocaleTimeString('nl-NL', { hour: '2-digit', minute: '2-digit' }));
    } catch (e) {
      setFout(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }, [timeframe]);

  // Bij openen en bij het wisselen van timeframe, maar via de cache — zie de
  // quotum-noot hierboven. Alleen de Ververs-knop haalt echt opnieuw op.
  useEffect(() => { void laad(false); }, [laad]);

  const s = matrix?.samenvatting;

  return (
    <div className="space-y-4">
      <WidgetCard title="Correlatie" icon={<GitCompareArrows className="h-4 w-4" />}>
        <p className="text-[12px] leading-relaxed text-tos-muted">
          Berekend op <span className="text-tos-text">rendementen</span> en op
          gedeelde tijdstippen — niet op prijs en niet op balknummer. Twee reeksen
          die allebei stijgen correleren anders bijna volledig, en dat is de trend
          die je meet in plaats van de instrumenten.
        </p>

        <div className="mt-4 flex flex-wrap items-center gap-2">
          {TIMEFRAMES.map((tf) => (
            <button
              key={tf}
              onClick={() => setTimeframe(tf)}
              className={`rounded-lg border px-3 py-1.5 font-mono text-[12px] transition-colors ${
                timeframe === tf
                  ? 'border-cyan-400/40 bg-cyan-400/10 text-cyan-200'
                  : 'border-white/10 bg-white/[0.02] text-tos-muted hover:bg-white/[0.05]'
              }`}
            >
              {tf}
            </button>
          ))}
          <button
            onClick={() => void laad(true)}
            disabled={busy}
            className="ml-auto flex items-center gap-2 rounded-lg border border-white/10 bg-white/[0.04] px-4 py-1.5 text-[12px] text-tos-text hover:bg-white/[0.08] disabled:opacity-40"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${busy ? 'animate-spin' : ''}`} />
            {busy ? 'Meten' : 'Ververs'}
          </button>
        </div>

        {op && !busy ? (
          <p className="mt-2 font-mono text-[10px] text-tos-dim">
            {timeframe} · {op} · {downloads}/{STANDAARD.length} opgehaald
            {downloads < STANDAARD.length ? `, ${STANDAARD.length - downloads} uit cache` : ''}
            {gemist.length ? ` · geen data voor ${gemist.join(', ')}` : ''}
          </p>
        ) : null}

        {fout ? (
          <p className="mt-3 rounded-lg border border-red-400/25 bg-red-500/[0.07] px-3 py-2.5 font-mono text-[11px] text-red-200/90">
            {fout}
          </p>
        ) : null}
      </WidgetCard>

      {matrix && matrix.symbolen.length > 0 ? (
        <>
          <WidgetCard title="Matrix">
            <div className="overflow-x-auto">
              <table className="text-[11px]">
                <thead>
                  <tr>
                    <th className="p-1" />
                    {matrix.symbolen.map((s2) => (
                      <th key={s2} className="p-1 font-mono text-[10px] font-normal text-tos-dim">
                        {s2}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {matrix.symbolen.map((rij, i) => (
                    <tr key={rij}>
                      <td className="p-1 pr-2 font-mono text-[10px] text-tos-dim">{rij}</td>
                      {matrix.symbolen.map((kol, j) => {
                        const r = matrix.cellen[i][j];
                        return (
                          <td
                            key={kol}
                            style={{ background: kleurVoor(r) }}
                            className="min-w-[54px] p-2 text-center font-mono tabular-nums text-tos-text"
                            title={r === null ? `te weinig gedeelde punten (< ${MIN_OVERLAP})` : `${rij} ~ ${kol}`}
                          >
                            {r === null ? '·' : r.toFixed(2)}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="mt-3 text-[11px] text-tos-dim">
              Een punt betekent <span className="text-tos-muted">niet gemeten</span>, niet
              &ldquo;geen samenhang&rdquo;: minder dan {MIN_OVERLAP} gedeelde tijdstippen.
              Goud staat stil in het weekend, crypto niet.
            </p>
          </WidgetCard>

          <div className="grid gap-4 md:grid-cols-2">
            <WidgetCard title="Loopt samen — dubbel risico">
              {s?.meestGecorreleerd.length ? (
                <ul className="space-y-2">
                  {s.meestGecorreleerd.map((p) => (
                    <li key={`${p.a}${p.b}`} className="flex items-center justify-between gap-3 rounded-lg border border-white/[0.06] bg-white/[0.02] px-3 py-2">
                      <span className="font-mono text-[12px] text-tos-text">{p.a} ~ {p.b}</span>
                      <span className="font-mono text-[12px] tabular-nums text-sky-300/90">{p.r!.toFixed(2)}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-[12px] text-tos-muted">Geen paren die noemenswaard samen lopen.</p>
              )}
            </WidgetCard>

            <WidgetCard title="Loopt tegengesteld — bruikbaar als hedge">
              {s?.besteHedges.length ? (
                <ul className="space-y-2">
                  {s.besteHedges.map((p) => (
                    <li key={`${p.a}${p.b}`} className="flex items-center justify-between gap-3 rounded-lg border border-white/[0.06] bg-white/[0.02] px-3 py-2">
                      <span className="font-mono text-[12px] text-tos-text">{p.a} ~ {p.b}</span>
                      <span className="font-mono text-[12px] tabular-nums text-red-300/90">{p.r!.toFixed(2)}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-[12px] text-tos-muted">Geen paren die tegen elkaar in bewegen.</p>
              )}
            </WidgetCard>
          </div>

          <WidgetCard title="Wat de agents hiervan krijgen">
            <p className="mb-3 text-[11px] leading-relaxed text-tos-muted">
              Letterlijk deze tekst gaat de context van een handelende agent in —
              uit dezelfde berekening als de matrix hierboven, zodat het scherm en
              de agent niet uit elkaar kunnen lopen.
            </p>
            <pre className="overflow-x-auto rounded-lg bg-black/40 p-3 font-mono text-[11px] leading-relaxed text-tos-muted">
              {correlatieVoorAgent(matrix, timeframe)}
            </pre>
          </WidgetCard>
        </>
      ) : !busy && !fout ? (
        <WidgetCard title="Geen data">
          <p className="text-[12px] text-tos-muted">
            LSE leverde voor geen van deze paren balken. Controleer London Strategic
            Edge in het Data Sources paneel — die vraagt de bron of hij antwoordt in
            plaats van of er een sleutel staat.
          </p>
        </WidgetCard>
      ) : null}
    </div>
  );
}
