/**
 * Correlatie tussen paren, op rendementen en op gedeelde tijdstippen.
 *
 * ## Waarom dit hier staat en niet in het paneel
 *
 * De agents handelen op dit bureau. Een cijfer dat alleen op een scherm leeft
 * kan een agent niet lezen, en dan is het een plaatje voor Luka in plaats van
 * kennis voor het bureau. Dit is daarom een pure functie: het paneel tekent
 * hem, de agent zet hem in zijn context, en er is één berekening in plaats van
 * twee die uit elkaar gaan lopen.
 *
 * ## Drie dingen die fout gaan als je ze niet expliciet doet
 *
 * 1. **Correleren op prijs in plaats van op rendement.** Twee reeksen die
 *    allebei stijgen geven een correlatie van bijna 1, ook als ze niets met
 *    elkaar te maken hebben — dat is de trend die correleert, niet de
 *    instrumenten. Rendementen halen die trend eruit. Dit is de klassieke
 *    fout, en hij ziet er niet uit als een fout: hij geeft mooie hoge
 *    getallen.
 *
 * 2. **Balken op index koppelen in plaats van op tijd.** XAUUSD en BTCUSD
 *    hebben niet dezelfde handelsuren: goud staat stil in het weekend, crypto
 *    niet. Balk 40 van de een is een ander moment dan balk 40 van de ander, en
 *    dan correleer je dinsdag met zaterdag. Daarom wordt er op timestamp
 *    samengevoegd en niet op positie.
 *
 * 3. **Een getal geven bij te weinig overlap.** Twee paren met zes gedeelde
 *    punten leveren makkelijk een correlatie van 0,9 op puur toeval. Onder
 *    MIN_OVERLAP geeft dit `null` — geen cijfer is eerlijker dan een cijfer
 *    dat je niet mag geloven, en het paneel toont dat als een leeg vakje in
 *    plaats van als een sterke samenhang.
 */
import type { OhlcBar } from '@/domain/tradingIntel/demoTypes';

/** Onder dit aantal gedeelde punten is een correlatie ruis. */
export const MIN_OVERLAP = 20;

export interface CorrelatiePaar {
  a: string;
  b: string;
  /** -1..1, of null bij te weinig overlap. */
  r: number | null;
  /** Aantal gedeelde tijdstippen waarop dit berekend is. */
  punten: number;
}

export interface CorrelatieMatrix {
  symbolen: string[];
  /** [i][j] = correlatie tussen symbolen[i] en symbolen[j]; diagonaal is 1. */
  cellen: (number | null)[][];
  paren: CorrelatiePaar[];
  /** Wat de agent moet weten zonder de matrix te hoeven lezen. */
  samenvatting: CorrelatieSamenvatting;
}

export interface CorrelatieSamenvatting {
  /** Sterkst positief samenlopende paren — het risico van dubbel inzitten. */
  meestGecorreleerd: CorrelatiePaar[];
  /** Sterkst tegengesteld — bruikbaar om af te dekken. */
  besteHedges: CorrelatiePaar[];
  /** Gemiddelde absolute correlatie: hoe geconcentreerd de mand is. */
  gemiddeldeAbsolute: number | null;
  /** Paren die te weinig overlap hadden om iets over te zeggen. */
  onvoldoendeData: CorrelatiePaar[];
}

/** Rendementen per tijdstip, zodat de trend niet meecorreleert. */
function rendementenOpTijd(bars: OhlcBar[]): Map<number, number> {
  const uit = new Map<number, number>();
  const gesorteerd = [...bars].sort((x, y) => x.t - y.t);
  for (let i = 1; i < gesorteerd.length; i++) {
    const vorige = gesorteerd[i - 1].c;
    const nu = gesorteerd[i].c;
    if (!Number.isFinite(vorige) || !Number.isFinite(nu) || vorige <= 0) continue;
    uit.set(gesorteerd[i].t, (nu - vorige) / vorige);
  }
  return uit;
}

export function pearson(xs: number[], ys: number[]): number | null {
  const n = Math.min(xs.length, ys.length);
  if (n < 2) return null;

  let sx = 0, sy = 0;
  for (let i = 0; i < n; i++) { sx += xs[i]; sy += ys[i]; }
  const mx = sx / n, my = sy / n;

  let boven = 0, vx = 0, vy = 0;
  for (let i = 0; i < n; i++) {
    const dx = xs[i] - mx, dy = ys[i] - my;
    boven += dx * dy; vx += dx * dx; vy += dy * dy;
  }
  const onder = Math.sqrt(vx * vy);
  // Een vlakke reeks heeft geen spreiding, en dus geen correlatie — niet 0,
  // want 0 leest als "geen verband gevonden" terwijl er niets te vinden was.
  if (onder === 0) return null;

  const r = boven / onder;
  return Math.max(-1, Math.min(1, r));
}

/** Correlatie tussen twee reeksen balken, op gedeelde tijdstippen. */
export function correleerBalken(a: OhlcBar[], b: OhlcBar[]): { r: number | null; punten: number } {
  const ra = rendementenOpTijd(a);
  const rb = rendementenOpTijd(b);

  const xs: number[] = [];
  const ys: number[] = [];
  for (const [t, v] of ra) {
    const w = rb.get(t);
    if (w === undefined) continue;
    xs.push(v); ys.push(w);
  }

  if (xs.length < MIN_OVERLAP) return { r: null, punten: xs.length };
  return { r: pearson(xs, ys), punten: xs.length };
}

/**
 * @param reeksen symbool → balken. Symbolen zonder balken vallen weg: een
 *        kolom vol lege vakjes zegt niets en kost breedte.
 */
export function bouwCorrelatieMatrix(
  reeksen: Record<string, OhlcBar[] | null | undefined>,
): CorrelatieMatrix {
  const symbolen = Object.keys(reeksen)
    .filter((s) => (reeksen[s]?.length ?? 0) > 1)
    .sort();

  const cellen: (number | null)[][] = symbolen.map(() => symbolen.map(() => null));
  const paren: CorrelatiePaar[] = [];

  for (let i = 0; i < symbolen.length; i++) {
    cellen[i][i] = 1;
    for (let j = i + 1; j < symbolen.length; j++) {
      const { r, punten } = correleerBalken(reeksen[symbolen[i]]!, reeksen[symbolen[j]]!);
      cellen[i][j] = r;
      cellen[j][i] = r;
      paren.push({ a: symbolen[i], b: symbolen[j], r, punten });
    }
  }

  return { symbolen, cellen, paren, samenvatting: vatSamen(paren) };
}

function vatSamen(paren: CorrelatiePaar[]): CorrelatieSamenvatting {
  const bruikbaar = paren.filter((p): p is CorrelatiePaar & { r: number } => p.r !== null);
  const onvoldoendeData = paren.filter((p) => p.r === null);

  const opSterkte = [...bruikbaar].sort((x, y) => y.r - x.r);

  return {
    meestGecorreleerd: opSterkte.filter((p) => p.r > 0).slice(0, 5),
    besteHedges: [...bruikbaar].sort((x, y) => x.r - y.r).filter((p) => p.r < 0).slice(0, 5),
    gemiddeldeAbsolute: bruikbaar.length
      ? bruikbaar.reduce((s, p) => s + Math.abs(p.r), 0) / bruikbaar.length
      : null,
    onvoldoendeData,
  };
}

/**
 * De matrix als tekst, voor in de context van een agent.
 *
 * Bewust een samenvatting en niet de hele tabel: een 17x17 raster is 289
 * getallen, en dat is meer tokens dan inzicht. Een agent die overweegt om
 * XAUUSD bij te kopen terwijl hij al XAGUSD aanhoudt moet weten dat die twee
 * op 0,9 lopen — niet wat GER40 met NZDUSD doet.
 */
export function correlatieVoorAgent(m: CorrelatieMatrix, timeframe: string): string {
  if (!m.symbolen.length) return 'Correlatie: geen data.';

  const pct = (r: number) => r.toFixed(2);
  const regels: string[] = [
    `CORRELATIE (${timeframe}, op rendementen, gedeelde tijdstippen)`,
  ];

  if (m.samenvatting.meestGecorreleerd.length) {
    regels.push(
      'Loopt samen (dubbel risico bij beide aanhouden): ' +
      m.samenvatting.meestGecorreleerd.map((p) => `${p.a}~${p.b} ${pct(p.r!)}`).join(', '),
    );
  }
  if (m.samenvatting.besteHedges.length) {
    regels.push(
      'Loopt tegengesteld (bruikbaar als hedge): ' +
      m.samenvatting.besteHedges.map((p) => `${p.a}~${p.b} ${pct(p.r!)}`).join(', '),
    );
  }
  if (m.samenvatting.gemiddeldeAbsolute !== null) {
    const g = m.samenvatting.gemiddeldeAbsolute;
    regels.push(
      `Gemiddelde absolute correlatie ${g.toFixed(2)} — ` +
      (g > 0.6 ? 'de mand is geconcentreerd, spreiding is hier schijn.'
        : g > 0.35 ? 'matige samenhang.'
        : 'de paren bewegen grotendeels los van elkaar.'),
    );
  }
  if (m.samenvatting.onvoldoendeData.length) {
    // Expliciet, want een agent moet het verschil weten tussen "niet
    // gecorreleerd" en "niet gemeten".
    regels.push(
      `Niet berekend (< ${MIN_OVERLAP} gedeelde punten): ` +
      m.samenvatting.onvoldoendeData.map((p) => `${p.a}~${p.b}`).join(', '),
    );
  }

  return regels.join('\n');
}
