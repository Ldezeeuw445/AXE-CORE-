/**
 * Macroreeksen van LSE, uit de catalogus die er toch al is.
 *
 * ## Waarom zoeken en niet een lijstje id's
 *
 * Een vaste lijst reeks-id's is een gok: staat er één fout tussen, dan is het
 * paneel leeg of -- erger -- toont het de verkeerde reeks onder de goede naam.
 * De catalogus (22.700 regels) wordt al één keer per sessie gehaald voor de
 * koersen, dus zoeken daarin kost geen extra download.
 *
 * ## Waarom dat telt
 *
 * LSE's gratis laag geeft TIEN downloads per uur. Een paneel dat per reeks
 * ophaalt bij elke render eet dat uur op en laat de koersen zonder data zitten.
 * Vandaar: filteren in de catalogus (gratis), en alleen de gekozen paar reeksen
 * echt ophalen.
 */
import type { LseCatalogusRegel } from '../tradingIntel/lseSymbolMatch';

/** Waar een handelsdesk in grondstoffen naar kijkt. */
export const MACRO_TERMEN = [
  'inventor', 'stocks', 'cpi', 'inflation', 'pmi', 'industrial production',
  'freight', 'baltic', 'warehouse',
] as const;

export interface MacroRegel {
  dataset: string;
  symbol: string;
  naam: string;
}

const plat = (s: string) => s.toLowerCase();

/**
 * De regels uit de catalogus die over macro gaan, hoogstens `max`.
 *
 * Geen prijsdatasets: die staan al in de koerstabel, en een reeks die ook een
 * koers is zou er twee keer staan onder twee namen.
 */
export function macroRegels(
  catalogus: readonly LseCatalogusRegel[],
  termen: readonly string[] = MACRO_TERMEN,
  max = 8,
): MacroRegel[] {
  const uit: MacroRegel[] = [];
  const gezien = new Set<string>();
  for (const r of catalogus) {
    if (!r?.symbol || !r?.dataset) continue;
    if (/^(fx|crypto|stocks|etf)$/i.test(r.dataset)) continue;
    const hooi = plat(`${r.name ?? ''} ${r.symbol}`);
    if (!termen.some(t => hooi.includes(plat(t)))) continue;
    const sleutel = `${r.dataset}:${r.symbol}`;
    if (gezien.has(sleutel)) continue;
    gezien.add(sleutel);
    uit.push({ dataset: r.dataset, symbol: r.symbol, naam: (r.name ?? r.symbol).trim() });
    if (uit.length >= max) break;
  }
  return uit;
}

export interface SerieWaarde {
  datum: string;
  waarde: number;
  /** De vorige punt, zodat het paneel een richting kan tonen zonder te rekenen in JSX. */
  vorige?: number;
}

/**
 * De laatste waarde uit een LSE-reeks.
 *
 * LSE geeft date/value-rijen oplopend terug, dus de laatste rij is de nieuwste.
 * Rijen zonder getal vallen weg in plaats van als 0 te tellen: een ontbrekende
 * meting is geen nulmeting.
 */
export function laatsteWaarde(rijen: unknown): SerieWaarde | null {
  const lijst = Array.isArray(rijen)
    ? rijen
    : Array.isArray((rijen as { data?: unknown[] })?.data)
      ? (rijen as { data: unknown[] }).data
      : null;
  if (!lijst?.length) return null;
  const schoon = lijst
    .map(r => {
      const o = r as Record<string, unknown>;
      const datum = typeof o.date === 'string' ? o.date : typeof o.ts === 'string' ? o.ts : null;
      const ruw = o.value ?? o.close ?? o.v;
      const waarde = typeof ruw === 'number' ? ruw : typeof ruw === 'string' ? Number(ruw) : NaN;
      return datum && Number.isFinite(waarde) ? { datum, waarde } : null;
    })
    .filter((x): x is { datum: string; waarde: number } => x !== null);
  if (!schoon.length) return null;
  const laatste = schoon[schoon.length - 1];
  return { ...laatste, vorige: schoon.length > 1 ? schoon[schoon.length - 2].waarde : undefined };
}
