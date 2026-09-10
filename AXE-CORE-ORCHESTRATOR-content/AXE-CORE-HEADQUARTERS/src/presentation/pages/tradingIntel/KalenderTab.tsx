/**
 * KalenderTab — niet wanneer de cijfers komen, maar wat ze de vorige keren deden.
 *
 * ## Waarom een agenda alleen niet genoeg is
 *
 * Dat NFP vrijdag om 14:30 komt weet je zelf; daar heb je geen scherm voor
 * nodig. De vraag waar een beslissing aan hangt is een andere: hoe hard beweegt
 * dít paar daar doorgaans op, en hoe ver duikt het onderweg? Dat eerste bepaalt
 * of je erdoorheen kunt zitten, dat tweede of je stop het overleeft.
 *
 * ## Twee getallen, niet één
 *
 * De **beweging** is de verandering van begin tot eind van het venster. De
 * **uitslag** is het verst dat het onderweg is weggelopen. Een print die eerst
 * 1,2% wegduikt en op +0,1% sluit ziet er in elke samenvatting rustig uit en
 * heeft je er ondertussen uitgetikt. Daarom staan ze los.
 *
 * ## Wat het niet weet, zegt het
 *
 * FRED dekt alleen de Verenigde Staten. Voor een paar zonder dollar staat hier
 * niets, en dat is beter dan een lege agenda die als "rustig" leest. Publicaties
 * waar geen koersdata bij te vinden was worden geteld en genoemd, niet
 * stilzwijgend overgeslagen.
 *
 * ## Quotum
 *
 * Elke publicatie is één dag balken bij LSE, en de gratis laag geeft tien
 * downloads per uur. Zes publicaties is dus zes aanroepen — één keer. Daarna
 * nooit meer: wat de koers in maart deed verandert niet, dus `lseBalkenOpDag`
 * bewaart die dagen zonder vervaltijd.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { RefreshCw, CalendarClock } from 'lucide-react';
import { WidgetCard } from '@/presentation/components/widgets/WidgetCard';
import { fetchEconomicReleases, fetchPastReleases } from '@/infrastructure/gateways/researchSources';
import { lseBalkenOpDag } from '@/infrastructure/gateways/lseMarketData';
import type { OhlcBar } from '@/domain/tradingIntel/demoTypes';
import { HIGH_IMPACT_US_RELEASES, currenciesOf, COVERED_CURRENCIES } from '@/domain/tradingIntel/economicCalendar';
import {
  impactGeschiedenis, impactVoorAgent, MIN_METINGEN,
  type ImpactGeschiedenis,
} from '@/domain/tradingIntel/gebeurtenisImpact';

const PAREN = ['XAUUSD', 'XAGUSD', 'EURUSD', 'GBPUSD', 'BTCUSD', 'USDJPY'];
const RELEASES = [...HIGH_IMPACT_US_RELEASES];
const VENSTERS = [30, 60, 120] as const;

/** Zes is genoeg om een verdeling te zien en past binnen het uurquotum. */
const MAX_PUBLICATIES = 6;

/** Kortere namen voor op het scherm; de volledige naam is de sleutel. */
const KORT: Record<string, string> = {
  'Employment Situation': 'NFP',
  'Consumer Price Index': 'CPI',
  'Producer Price Index': 'PPI',
  'Gross Domestic Product': 'BBP',
  'Personal Income and Outlays': 'PCE',
  'Advance Monthly Sales for Retail and Food Services': 'Retail Sales',
};

function kleurVoor(pct: number): string {
  return pct >= 0 ? 'text-emerald-300/90' : 'text-red-300/90';
}

/**
 * Hele kalenderdagen tot `datum`, niet verstreken uren.
 *
 * Met Date.now() als ijkpunt werd alles binnen twaalf uur "vandaag" — gemeten
 * op 10 september stond CPI van de 11e als vandaag op het scherm. Een publicatie
 * een dag te vroeg tonen is precies de fout die je een positie laat sluiten die
 * had kunnen blijven staan. Dus middernacht UTC tegen middernacht UTC.
 */
function dagenTot(datum: string): number {
  const nu = new Date();
  const vandaag = Date.UTC(nu.getUTCFullYear(), nu.getUTCMonth(), nu.getUTCDate());
  const doel = Date.parse(`${datum}T00:00:00Z`);
  if (!Number.isFinite(doel)) return 0;
  return Math.round((doel - vandaag) / 86_400_000);
}

export function KalenderTab() {
  const [paar, setPaar] = useState('XAUUSD');
  const [release, setRelease] = useState(RELEASES[0]);
  const [venster, setVenster] = useState<number>(60);

  const [komend, setKomend] = useState<Array<{ date: string; name: string }>>([]);
  const [verleden, setVerleden] = useState<Array<{ date: string; name: string }>>([]);
  const [geschiedenis, setGeschiedenis] = useState<ImpactGeschiedenis | null>(null);
  const [busy, setBusy] = useState(false);
  const [fout, setFout] = useState<string | null>(null);
  const [opgehaald, setOpgehaald] = useState(0);

  // De agenda hoort bij de dag, niet bij de keuze: één keer halen, en beide
  // richtingen tegelijk. Ze delen dezelfde bron en hetzelfde dagquotum.
  useEffect(() => {
    let levend = true;
    void (async () => {
      try {
        const [v, t] = await Promise.all([fetchEconomicReleases(), fetchPastReleases(400)]);
        if (!levend) return;
        setKomend(v);
        setVerleden(t);
      } catch (e) {
        if (levend) setFout(e instanceof Error ? e.message : String(e));
      }
    })();
    return () => { levend = false; };
  }, []);

  const gedekt = useMemo(
    () => currenciesOf(paar).some(c => COVERED_CURRENCIES.has(c)),
    [paar],
  );

  const meet = useCallback(async () => {
    if (!verleden.length || !gedekt) return;
    setBusy(true);
    setFout(null);

    try {
      const dagen = verleden
        .filter(e => e.name === release)
        .sort((a, b) => (a.date < b.date ? 1 : -1))
        .slice(0, MAX_PUBLICATIES);

      // Serieel: zes gelijktijdige aanroepen tegen een bron met tien downloads
      // per uur is de snelste manier om je uur op te maken aan één klik.
      const alle: OhlcBar[] = [];
      let live = 0;
      for (const d of dagen) {
        const bars = await lseBalkenOpDag(paar, d.date, 'M15');
        if (bars?.length) { alle.push(...bars); live++; }
      }
      setOpgehaald(live);

      setGeschiedenis(impactGeschiedenis({
        symbool: paar,
        naam: release,
        gebeurtenissen: dagen.map(d => ({ datum: d.date, naam: d.name })),
        bars: alle,
        vensterMinuten: venster,
      }));
    } catch (e) {
      setFout(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }, [verleden, gedekt, release, paar, venster]);

  useEffect(() => { void meet(); }, [meet]);

  const komendeHoogImpact = useMemo(
    () => komend
      .filter(e => HIGH_IMPACT_US_RELEASES.has(e.name))
      .sort((a, b) => (a.date < b.date ? -1 : 1))
      .slice(0, 6),
    [komend],
  );

  const s = geschiedenis?.samenvatting;

  return (
    <div className="space-y-4">
      <WidgetCard title="Economische kalender" icon={<CalendarClock className="h-4 w-4" />}>
        <p className="text-[12px] leading-relaxed text-tos-muted">
          Niet wanneer de cijfers komen — dat weet je — maar{' '}
          <span className="text-tos-text">wat ze de vorige keren met dit paar deden</span>.
          Gemeten op balken van vijftien minuten, vanaf de balk die vóór de
          publicatie sluit.
        </p>

        <div className="mt-4 flex flex-wrap items-center gap-2">
          <select
            value={paar}
            onChange={(e) => setPaar(e.target.value)}
            className="rounded-lg border border-white/10 bg-white/[0.04] px-3 py-1.5 font-mono text-[12px] text-tos-text"
          >
            {PAREN.map(p => <option key={p} value={p}>{p}</option>)}
          </select>

          <select
            value={release}
            onChange={(e) => setRelease(e.target.value)}
            className="rounded-lg border border-white/10 bg-white/[0.04] px-3 py-1.5 text-[12px] text-tos-text"
          >
            {RELEASES.map(r => <option key={r} value={r}>{KORT[r] ?? r}</option>)}
          </select>

          {VENSTERS.map(v => (
            <button
              key={v}
              onClick={() => setVenster(v)}
              className={`rounded-lg border px-3 py-1.5 font-mono text-[12px] transition-colors ${
                venster === v
                  ? 'border-cyan-400/40 bg-cyan-400/10 text-cyan-200'
                  : 'border-white/10 bg-white/[0.02] text-tos-muted hover:bg-white/[0.05]'
              }`}
            >
              {v}m
            </button>
          ))}

          <button
            onClick={() => void meet()}
            disabled={busy}
            className="ml-auto flex items-center gap-2 rounded-lg border border-white/10 bg-white/[0.04] px-4 py-1.5 text-[12px] text-tos-text hover:bg-white/[0.08] disabled:opacity-40"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${busy ? 'animate-spin' : ''}`} />
            {busy ? 'Meten' : 'Ververs'}
          </button>
        </div>

        {!gedekt ? (
          <p className="mt-3 rounded-lg border border-amber-400/25 bg-amber-500/[0.07] px-3 py-2.5 text-[11px] leading-relaxed text-amber-200/90">
            Deze agenda komt van FRED en dekt alleen de Verenigde Staten. {paar} heeft
            geen dollar-been, dus hier staat <span className="text-amber-100">niets</span> —
            niet &ldquo;rustig&rdquo;. Voor een oordeel over dit paar is een tweede bron nodig.
          </p>
        ) : null}

        {fout ? (
          <p className="mt-3 rounded-lg border border-red-400/25 bg-red-500/[0.07] px-3 py-2.5 font-mono text-[11px] text-red-200/90">
            {fout}
          </p>
        ) : null}
      </WidgetCard>

      <WidgetCard title="Wat eraan komt">
        {komendeHoogImpact.length ? (
          <ul className="space-y-2">
            {komendeHoogImpact.map(e => {
              const d = dagenTot(e.date);
              return (
                <li key={`${e.date}${e.name}`} className="flex items-center justify-between gap-3 rounded-lg border border-white/[0.06] bg-white/[0.02] px-3 py-2">
                  <span className="flex items-center gap-3">
                    <span className="font-mono text-[11px] text-tos-dim">{e.date}</span>
                    <span className="text-[12px] text-tos-text">{KORT[e.name] ?? e.name}</span>
                  </span>
                  <span className={`font-mono text-[11px] tabular-nums ${d <= 2 ? 'text-amber-300/90' : 'text-tos-dim'}`}>
                    {d <= 0 ? 'vandaag' : `over ${d}d`}
                  </span>
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="text-[12px] text-tos-muted">
            Geen hoog-impact publicaties opgehaald. Dat kan het dagquotum van FRED zijn —
            controleer London Strategic Edge en FRED in het Data Sources paneel.
          </p>
        )}
        <p className="mt-3 text-[11px] text-tos-dim">
          Alleen de zes releases die de dollar werkelijk herprijzen. Wekelijkse
          claims en JOLTS staan er bewust niet bij: die vuren bijna elke week en
          een poort die altijd dichtstaat is een gesloten bureau.
        </p>
      </WidgetCard>

      {geschiedenis && s ? (
        <>
          <WidgetCard title={`${KORT[release] ?? release} → ${paar}, ${venster} min na publicatie`}>
            {s.medianeBeweging === null ? (
              <p className="text-[12px] leading-relaxed text-tos-muted">
                {s.gemeten} van {s.gemeten + s.ongemeten} publicaties gemeten, en dat is
                onder de drempel van {MIN_METINGEN}. Er staat hier geen mediaan, want twee
                metingen zijn een anekdote — <span className="text-tos-text">onbekend, niet rustig</span>.
              </p>
            ) : (
              <>
                <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
                  <div className="rounded-lg border border-white/[0.06] bg-white/[0.02] px-3 py-3">
                    <p className="font-mono text-[10px] uppercase tracking-wide text-tos-dim">Mediane beweging</p>
                    <p className="mt-1 font-mono text-[20px] tabular-nums text-tos-text">{s.medianeBeweging.toFixed(2)}%</p>
                  </div>
                  <div className="rounded-lg border border-white/[0.06] bg-white/[0.02] px-3 py-3">
                    <p className="font-mono text-[10px] uppercase tracking-wide text-tos-dim">Mediane uitslag</p>
                    <p className="mt-1 font-mono text-[20px] tabular-nums text-amber-200/90">{s.medianeUitslag!.toFixed(2)}%</p>
                  </div>
                  <div className="rounded-lg border border-white/[0.06] bg-white/[0.02] px-3 py-3">
                    <p className="font-mono text-[10px] uppercase tracking-wide text-tos-dim">Richting</p>
                    <p className="mt-1 text-[13px] text-tos-text">
                      {s.richting
                        ? `${Math.round(s.richtingVastheid! * s.gemeten)} van ${s.gemeten} ${s.richting}`
                        : 'geen overhand'}
                    </p>
                  </div>
                </div>
                <p className="mt-3 text-[11px] leading-relaxed text-tos-dim">
                  De <span className="text-tos-muted">uitslag</span> is het verst dat het
                  onderweg wegliep, niet waar het sloot. Dat is het getal dat je stop raakt,
                  en het staat op geen enkele kalender.
                </p>
              </>
            )}
          </WidgetCard>

          {geschiedenis.metingen.length ? (
            <WidgetCard title="Per publicatie">
              <div className="overflow-x-auto">
                <table className="w-full text-[11px]">
                  <thead>
                    <tr className="text-left">
                      {['datum', 'voor', 'na', 'beweging', 'uitslag'].map(h => (
                        <th key={h} className="p-1.5 font-mono text-[10px] font-normal uppercase tracking-wide text-tos-dim">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {geschiedenis.metingen.map(m => (
                      <tr key={m.datum} className="border-t border-white/[0.05]">
                        <td className="p-1.5 font-mono text-tos-dim">{m.datum}</td>
                        <td className="p-1.5 font-mono tabular-nums text-tos-muted">{m.voor.toFixed(m.voor > 50 ? 2 : 5)}</td>
                        <td className="p-1.5 font-mono tabular-nums text-tos-muted">{m.na.toFixed(m.na > 50 ? 2 : 5)}</td>
                        <td className={`p-1.5 font-mono tabular-nums ${kleurVoor(m.procent)}`}>
                          {m.procent >= 0 ? '+' : ''}{m.procent.toFixed(2)}%
                        </td>
                        <td className="p-1.5 font-mono tabular-nums text-amber-200/80">{m.uitslag.toFixed(2)}%</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="mt-3 font-mono text-[10px] text-tos-dim">
                {opgehaald} dag(en) koersdata gebruikt
                {s.ongemeten > 0 ? ` · ${s.ongemeten} publicatie(s) zonder data over dat venster` : ''}
              </p>
            </WidgetCard>
          ) : null}

          <WidgetCard title="Wat de agents hiervan zouden krijgen">
            <p className="mb-3 text-[11px] leading-relaxed text-tos-muted">
              Uit dezelfde berekening als de tegels hierboven, dus scherm en agent
              kunnen niet uit elkaar lopen.
            </p>
            <p className="mb-3 rounded-lg border border-amber-400/25 bg-amber-500/[0.07] px-3 py-2 text-[11px] leading-relaxed text-amber-200/90">
              <span className="text-amber-100">Nog niet aangesloten.</span>{' '}
              De correlatie gaat inmiddels wél via de bureauhartslag de agents in; deze
              nog niet. Zes dagen koersdata per combinatie van release en paar, maal
              zesendertig combinaties, is een veelvoud van tien downloads per uur. Dat
              vraagt om een beurtrol of een betaalde laag — een keuze, geen detail.
            </p>
            <pre className="overflow-x-auto rounded-lg bg-black/40 p-3 font-mono text-[11px] leading-relaxed text-tos-muted">
              {impactVoorAgent(geschiedenis)}
            </pre>
          </WidgetCard>
        </>
      ) : !busy && gedekt ? (
        <WidgetCard title="Nog niets gemeten">
          <p className="text-[12px] text-tos-muted">
            Er zijn geen publicaties uit het verleden opgehaald. Dat is de FRED-kant:
            controleer of <span className="font-mono">fred_calendar</span> met{' '}
            <span className="font-mono">back</span> antwoordt op de API-box.
          </p>
        </WidgetCard>
      ) : null}
    </div>
  );
}
