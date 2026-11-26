/**
 * Rekenwerk voor de grafiek in het 3D-vak (26 nov, Luka: "het moet 100% kloppen").
 *
 * Een koers rond $95.000 die 1% beweegt was onzichtbaar: de as begon bij 0 en
 * alle staven waren even hoog. Een koersgrafiek schaalt nu van laag tot hoog
 * (met wat lucht), met leesbare stappen. Een verdeling (inkomen per bron)
 * begint wél bij 0, want daar is het verschil tot 0 de informatie.
 */

export type Candle = { t: number; o: number; h: number; l: number; c: number };

/** Mooie stapgrootte: 1, 2, 2.5 of 5 maal een macht van 10. */
export function mooieStap(bereik: number, stappen = 4): number {
  if (!(bereik > 0)) return 1;
  const ruw = bereik / Math.max(1, stappen);
  const macht = 10 ** Math.floor(Math.log10(ruw));
  const f = ruw / macht;
  const mooi = f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10;
  return mooi * macht;
}

/** As voor een koers: van net onder het laagste tot net boven het hoogste, op mooie stappen. */
export function prijsAs(laag: number, hoog: number, stappen = 4): { min: number; max: number; ticks: number[] } {
  if (!Number.isFinite(laag) || !Number.isFinite(hoog)) return { min: 0, max: 1, ticks: [0, 1] };
  if (hoog === laag) { const d = Math.abs(hoog) * 0.01 || 1; laag -= d; hoog += d; }
  const stap = mooieStap(hoog - laag, stappen);
  const min = Math.floor(laag / stap) * stap;
  const max = Math.ceil(hoog / stap) * stap;
  const ticks: number[] = [];
  for (let v = min; v <= max + stap / 2; v += stap) ticks.push(Number(v.toFixed(10)));
  return { min, max, ticks };
}

/** "$95,120" / "$0.2341" / "1.2k": zoveel decimalen als de prijs nodig heeft. */
export function prijsTekst(v: number, valuta = '$'): string {
  const a = Math.abs(v);
  const dec = a >= 1000 ? 0 : a >= 100 ? 1 : a >= 1 ? 2 : 4;
  return `${valuta}${v.toLocaleString('en-US', { minimumFractionDigits: dec, maximumFractionDigits: dec })}`;
}

export function verandering(candles: readonly Candle[]): { laatste: number; pct: number; hoog: number; laag: number } | null {
  if (!candles.length) return null;
  const eerste = candles[0].o;
  const laatste = candles[candles.length - 1].c;
  return {
    laatste,
    pct: eerste ? ((laatste - eerste) / eerste) * 100 : 0,
    hoog: Math.max(...candles.map((c) => c.h)),
    laag: Math.min(...candles.map((c) => c.l)),
  };
}

/** Lees candles uit een projectie; alleen complete rijen tellen. */
export function leesCandles(series: unknown): Candle[] {
  if (!Array.isArray(series)) return [];
  return series.flatMap((p) => {
    const r = p as Record<string, unknown>;
    const [t, o, h, l, c] = [r.t, r.o, r.h, r.l, r.c].map(Number);
    return [t, o, h, l, c].every(Number.isFinite) ? [{ t, o, h, l, c }] : [];
  });
}
