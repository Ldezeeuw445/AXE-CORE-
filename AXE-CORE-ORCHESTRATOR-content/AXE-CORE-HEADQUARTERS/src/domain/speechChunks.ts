/**
 * AXE spreekt zin voor zin, niet het hele antwoord in één keer.
 *
 * De lokale stem (Kokoro op de Mac mini) is maar ~1,5x sneller dan realtime:
 * een hele alinea in één keer laten maken betekent 6-9 seconden stilte vóór
 * het eerste woord. In stukken hoort Luka de eerste zin na ~2 seconden, en
 * wordt de volgende gemaakt terwijl de vorige speelt.
 *
 * Puur en zonder afhankelijkheden, zodat het te testen is.
 */

// Afkortingen waar een punt geen zinseinde is ("e.g. this", "Mr. Smith").
const AFKORTINGEN = /\b(?:mr|mrs|ms|dr|st|vs|etc|e\.g|i\.e|approx|no|fig)\.$/i;

/** Kortere stukken dan dit plakken we aan het volgende: snippers als "Ok."
 *  geven hakkelige pauzes tussen de audiofragmenten. Niet hoger: een korte
 *  echte zin ("Morning, Luka.", 14) moet juist los, want die klinkt het snelst. */
const MIN_STUK = 10;

/**
 * Knip tekst in spreekbare stukken: op zinseinden en regeleinden, lange zinnen
 * op komma/puntkomma/dubbele punt, en als dat niet genoeg is op een woordgrens.
 * Elk stuk is hooguit `maxLen` tekens. Lege stukken bestaan niet.
 */
export function splitIntoSpeechChunks(text: string, maxLen = 280): string[] {
  const zinnen: string[] = [];
  for (const regel of text.split(/\n+/)) {
    const r = regel.trim();
    if (!r) continue;
    let begin = 0;
    const eind = /[.!?…]+["')\]]*(?=\s|$)/g;
    let m: RegExpExecArray | null;
    while ((m = eind.exec(r)) !== null) {
      const tot = m.index + m[0].length;
      const kandidaat = r.slice(begin, tot).trim();
      if (AFKORTINGEN.test(kandidaat)) continue;
      if (kandidaat) zinnen.push(kandidaat);
      begin = tot;
    }
    const rest = r.slice(begin).trim();
    if (rest) zinnen.push(rest);
  }

  const knip = (zin: string): string[] => {
    if (zin.length <= maxLen) return [zin];
    const delen: string[] = [];
    let huidig = '';
    for (const deel of zin.split(/(?<=[,;:])\s+/)) {
      const samen = huidig ? `${huidig} ${deel}` : deel;
      if (samen.length <= maxLen) { huidig = samen; continue; }
      if (huidig) delen.push(huidig);
      huidig = deel;
      // Eén deel zonder leesteken dat nog te lang is: knip op woordgrens.
      while (huidig.length > maxLen) {
        const spatie = huidig.lastIndexOf(' ', maxLen);
        const snij = spatie > 0 ? spatie : maxLen;
        delen.push(huidig.slice(0, snij).trim());
        huidig = huidig.slice(snij).trim();
      }
    }
    if (huidig) delen.push(huidig);
    return delen;
  };

  const stukken: string[] = [];
  let wacht = '';
  for (const zin of zinnen.flatMap(knip)) {
    const samen = wacht ? `${wacht} ${zin}` : zin;
    if (samen.length < MIN_STUK) { wacht = samen; continue; }
    if (samen.length > maxLen && wacht) { stukken.push(wacht); wacht = zin; continue; }
    stukken.push(samen);
    wacht = '';
  }
  if (wacht) {
    if (stukken.length && `${stukken[stukken.length - 1]} ${wacht}`.length <= maxLen) {
      stukken[stukken.length - 1] = `${stukken[stukken.length - 1]} ${wacht}`;
    } else {
      stukken.push(wacht);
    }
  }
  return stukken;
}

const ZIN_KLAAR = /[.!?…]["')\]]*$/;

/**
 * Welke stukken mag de stem NU al maken terwijl de LLM nog tokens stuurt.
 * De laatste zin zonder eindteken blijft liggen tot `afgerond`.
 */
export function klaarSpraakStukken(text: string, afgerond: boolean): string[] {
  const all = splitIntoSpeechChunks(text);
  if (afgerond || all.length === 0) return all;
  const last = all[all.length - 1];
  if (ZIN_KLAAR.test(last)) return all;
  return all.slice(0, -1);
}

/** Nieuwe stukken sinds `alGezegd` klaar-stukken. */
export function nieuweSpraakStukken(
  alGezegd: number,
  text: string,
  afgerond: boolean,
): { stukken: string[]; tot: number } {
  const klaar = klaarSpraakStukken(text, afgerond);
  return { stukken: klaar.slice(Math.max(0, alGezegd)), tot: klaar.length };
}

/**
 * Hoeveel van `text` zichtbaar is bij `fraction` (0..1) van de uitgesproken
 * stem. Nooit midden in een woord: we lopen door tot het einde van het woord
 * waarin de grens valt, zodat de tekst woord voor woord verschijnt in plaats
 * van letter voor letter te flikkeren.
 */
export function revealCut(text: string, fraction: number): number {
  if (!(fraction > 0)) return 0;
  if (fraction >= 1) return text.length;
  const ruw = Math.round(fraction * text.length);
  if (ruw >= text.length) return text.length;
  const volgendeSpatie = text.slice(ruw).search(/\s/);
  return volgendeSpatie === -1 ? text.length : ruw + volgendeSpatie;
}
