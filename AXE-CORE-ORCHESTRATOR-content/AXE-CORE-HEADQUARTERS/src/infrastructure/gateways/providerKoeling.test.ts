/**
 * Wat hier bewezen wordt, en waarom juist dit.
 *
 * De storing die deze module oplost is niet "Groq gaf een 429" — dat is één
 * mislukte beurt en niet erg. De storing is dat de volgende zin het opnieuw
 * bij Groq probeert, en de zin daarna weer, tot het eind van de dag. Elk van
 * deze tests pint één schakel van die keten vast:
 *
 *   * een dagtegoed wordt als dag herkend (en niet als "even wachten"),
 *   * een retry-after wordt als díe duur herkend en niet als een dag,
 *   * de koeling gaat vanzelf weer open — hem vergeten is net zo fout als hem
 *     nooit zetten,
 *   * hij overleeft een herstart, want anders is hij waardeloos bij een
 *     limiet die uren duurt,
 *   * en een gewone storing koelt niets af, zodat tien seconden Groq-hik geen
 *     dag zonder Groq wordt.
 *
 * De klok wordt gestuurd, nooit afgewacht: een test die tot middernacht wacht
 * is geen test.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  KOELING_SLEUTEL,
  herkenOp,
  isOp,
  koelTot,
  markeerOp,
  wisKoeling,
} from '@/infrastructure/gateways/providerKoeling';

/** Een localStorage die zich gedraagt: vitest draait hier in node, dus er is er geen. */
function maakOpslag(): Storage & { kaart: Map<string, string> } {
  const kaart = new Map<string, string>();
  return {
    kaart,
    get length() {
      return kaart.size;
    },
    key: (i: number) => [...kaart.keys()][i] ?? null,
    getItem: (k: string) => kaart.get(k) ?? null,
    setItem: (k: string, v: string) => void kaart.set(k, String(v)),
    removeItem: (k: string) => void kaart.delete(k),
    clear: () => kaart.clear(),
  } as Storage & { kaart: Map<string, string> };
}

let opslag = maakOpslag();

/** 14:23 UTC op 25 september 2026 — midden op de dag, zodat middernacht echt verderop ligt. */
const MIDDAG = Date.UTC(2026, 8, 25, 14, 23, 0, 0);
const MIDDERNACHT = Date.UTC(2026, 8, 26, 0, 0, 0, 0);

const klok = (t: number) => () => t;

beforeEach(() => {
  opslag = maakOpslag();
  Object.defineProperty(globalThis, 'localStorage', {
    value: opslag,
    configurable: true,
    writable: true,
  });
  wisKoeling();
});

describe('herkenOp', () => {
  it('leest Groq\'s dagtegoed als een dag, niet als een wachtje', () => {
    // De letterlijke vorm die Groq stuurt.
    const body =
      'Rate limit reached for model `llama-3.1-8b-instant` in organization `org_01` ' +
      'service tier `on_demand` on tokens per day (TPD): Limit 500000, Used 500000, ' +
      'Requested 1200. Please try again in 9m33.6s.';
    expect(herkenOp(429, body)).toBe('dag');
  });

  it('herkent ook de verzoeken-variant en de kale afkorting', () => {
    expect(herkenOp(429, 'limit reached on requests per day: Limit 14400')).toBe('dag');
    expect(herkenOp(429, 'quota exhausted (RPD)')).toBe('dag');
  });

  it('een dagtegoed blijft een dag, ook als er een retry-after naast staat', () => {
    // Groq stuurt bij een dagtegoed óók een retry-after. De body weet beter.
    const koppen = new Headers({ 'retry-after': '573' });
    expect(herkenOp(429, 'on tokens per day (TPD): Limit 500000', koppen)).toBe('dag');
  });

  it('rekent retry-after om van seconden naar ms', () => {
    expect(herkenOp(429, 'Rate limit reached', new Headers({ 'retry-after': '30' }))).toBe(30_000);
    // Kommagetallen komen echt voor, en een kale record moet ook werken.
    expect(herkenOp(429, 'Rate limit reached', { 'Retry-After': '7.66' })).toBe(7660);
  });

  it('koelt niet af op iets dat geen limiet is', () => {
    expect(herkenOp(500, 'Internal Server Error')).toBeNull();
    expect(herkenOp(503, 'upstream unavailable', new Headers({ 'retry-after': '30' }))).toBeNull();
    // Een 200 met dezelfde woorden erin is een antwoord, geen weigering.
    expect(herkenOp(200, 'we counted your tokens per day')).toBeNull();
    // Een 429 per MINUUT zonder duur: die is over voordat we hem opschrijven.
    expect(herkenOp(429, 'Rate limit reached on requests per minute (RPM)')).toBeNull();
  });
});

describe('markeerOp en isOp', () => {
  it('een dagtegoed koelt tot de eerstvolgende 00:00 UTC', () => {
    markeerOp('groq', 'dag', klok(MIDDAG));

    expect(koelTot('groq', klok(MIDDAG))).toBe(MIDDERNACHT);
    expect(isOp('groq', klok(MIDDAG))).toBe(true);
    // Een minuut vóór middernacht nog steeds op, een tel erna weer vrij.
    expect(isOp('groq', klok(MIDDERNACHT - 60_000))).toBe(true);
    expect(isOp('groq', klok(MIDDERNACHT))).toBe(false);
  });

  it('een retry-after koelt precies die duur', () => {
    markeerOp('groq', 30_000, klok(MIDDAG));

    expect(koelTot('groq', klok(MIDDAG))).toBe(MIDDAG + 30_000);
    expect(isOp('groq', klok(MIDDAG + 29_999))).toBe(true);
    // Zodra de klok voorbij het tijdstip is, mag er weer gevraagd worden —
    // en dan geeft koelTot geen tijdstip uit het verleden meer terug.
    expect(isOp('groq', klok(MIDDAG + 30_000))).toBe(false);
    expect(koelTot('groq', klok(MIDDAG + 30_000))).toBeNull();
  });

  it('kort een lopende dagkoeling niet in op een kort nabeefje', () => {
    markeerOp('groq', 'dag', klok(MIDDAG));
    markeerOp('groq', 5_000, klok(MIDDAG + 1_000));

    expect(koelTot('groq', klok(MIDDAG + 1_000))).toBe(MIDDERNACHT);
  });

  it('koelt alleen de provider die nee zei', () => {
    markeerOp('groq', 'dag', klok(MIDDAG));

    expect(isOp('openai', klok(MIDDAG))).toBe(false);
    expect(koelTot('openai', klok(MIDDAG))).toBeNull();
  });
});

describe('de stand op schijf', () => {
  it('overleeft een herstart van de app', async () => {
    markeerOp('groq', 'dag', klok(MIDDAG));
    expect(opslag.kaart.has(KOELING_SLEUTEL)).toBe(true);

    // Een herstart: nieuwe module-instantie, leeg geheugen, dezelfde opslag.
    vi.resetModules();
    const verse = await import('@/infrastructure/gateways/providerKoeling');

    expect(verse.isOp('groq', klok(MIDDAG + 60_000))).toBe(true);
    expect(verse.koelTot('groq', klok(MIDDAG + 60_000))).toBe(MIDDERNACHT);
  });

  it('valt niet om over rommel onder dezelfde sleutel', () => {
    opslag.kaart.set(KOELING_SLEUTEL, '{niet eens json');
    expect(isOp('groq', klok(MIDDAG))).toBe(false);

    // Een niet-getal mag een provider niet voor altijd uitzetten.
    opslag.kaart.set(KOELING_SLEUTEL, JSON.stringify({ groq: 'morgen' }));
    expect(isOp('groq', klok(MIDDAG))).toBe(false);

    // En 1e999 evenmin — JSON kent geen Infinity, maar parseert er wél
    // naartoe, en dat is de ene rommelwaarde die groter is dan elke klok.
    opslag.kaart.set(KOELING_SLEUTEL, '{"groq":1e999}');
    expect(isOp('groq', klok(MIDDAG))).toBe(false);
    expect(koelTot('groq', klok(MIDDAG))).toBeNull();
  });
});
