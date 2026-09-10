/**
 * Minuutbalken vouwen tot een grotere balk.
 *
 * ## Waarom dit nodig is
 *
 * LSE levert alles als MINUUTbalken en negeert de gevraagde resolutie —
 * gemeten 10 september 2026: `resolution=1h`, `resolution=60` en `interval=1h`
 * geven alle drie dezelfde rijen van één minuut. Wie een uurgrafiek wil moet
 * dus zelf vouwen.
 *
 * ## De regels van een balk
 *
 * Open is de eerste, close de laatste, high het hoogste, low het laagste,
 * volume de som. Dat klinkt vanzelfsprekend en is precies waar het misgaat als
 * je het per ongeluk op gesorteerde-op-iets-anders data doet: dan wordt "de
 * eerste" een willekeurige. Vandaar dat dit sorteert voor het vouwt.
 *
 * ## Waarom emmers op de klok liggen
 *
 * Een uurbalk hoort op het hele uur te beginnen, niet een uur na de eerste rij
 * die je toevallig kreeg. Anders verschuiven alle balken zodra je een minuut
 * eerder begint op te halen, en dan komt er uit dezelfde data een andere
 * grafiek — het soort verschil dat je pas ziet als een indicator anders staat.
 */
import type { OhlcBar } from '@/domain/tradingIntel/demoTypes';

/** Hoeveel milliseconden één balk beslaat. Onbekend = uur. */
export function balkDuurMs(timeframe: string): number {
  const tf = timeframe.trim().toLowerCase();
  const tabel: Record<string, number> = {
    m1: 60_000, m5: 300_000, m15: 900_000, m30: 1_800_000,
    h1: 3_600_000, h4: 14_400_000, d1: 86_400_000,
  };
  return tabel[tf] ?? 3_600_000;
}

/**
 * Vouw balken tot `timeframe`.
 *
 * Balken die al even lang of langer zijn komen ongewijzigd terug: vouwen wat
 * al gevouwen is zou stilletjes verkeerde highs geven.
 */
export function vouwBalken(bars: readonly OhlcBar[], timeframe: string): OhlcBar[] {
  const duur = balkDuurMs(timeframe);
  if (duur <= 60_000 || bars.length === 0) return [...bars];

  const gesorteerd = [...bars].sort((a, b) => a.t - b.t);
  const uit: OhlcBar[] = [];
  let emmer = -1;

  for (const b of gesorteerd) {
    if (!Number.isFinite(b.t)) continue;
    // Op de klok, niet op de eerste rij -- zie de kop.
    const start = Math.floor(b.t / duur) * duur;
    if (start !== emmer) {
      emmer = start;
      uit.push({ t: start, o: b.o, h: b.h, l: b.l, c: b.c, v: b.v ?? 0 });
      continue;
    }
    const huidig = uit[uit.length - 1];
    huidig.h = Math.max(huidig.h, b.h);
    huidig.l = Math.min(huidig.l, b.l);
    huidig.c = b.c;
    huidig.v = (huidig.v ?? 0) + (b.v ?? 0);
  }
  return uit;
}

/**
 * Hoeveel minuutrijen je moet ophalen voor `aantal` balken van `timeframe`.
 *
 * Met een marge, want markten hebben gaten: een weekend zit niet in de data en
 * een uur zonder handel geeft geen zestig rijen. Zonder marge kom je bij d1
 * structureel balken tekort en ziet een grafiek er ingekort uit zonder dat
 * iets faalt.
 */
export function minutenNodig(aantal: number, timeframe: string): number {
  const perBalk = Math.max(1, Math.round(balkDuurMs(timeframe) / 60_000));
  return Math.min(20_000, Math.ceil(aantal * perBalk * 1.4));
}
