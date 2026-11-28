/**
 * Hoe een levend AXE-gezicht knippert en kijkt (Luka 27 nov, t78u: "het
 * effect kan veel realistischer, echt premium").
 *
 * v4 knipperde op een vaste klok (5,2 s) en keek in een vast rondje. Dat zie
 * je na twee keer: het is een loop, geen wezen. Echte ogen knipperen
 * onregelmatig (2-7 s, soms twee keer kort na elkaar) en kijken met snelle
 * sprongetjes (saccades) naar een punt, blijven daar even en komen terug.
 *
 * Puur en zonder klok: `rnd` komt van buiten (Math.random in de app, een
 * vaste reeks in de test), zodat de spreiding te testen is.
 */
/** Zelfde stemmingen als AxeGezicht (domein leunt niet op presentatie). */
type Stemming = 'rust' | 'werkt' | 'wacht' | 'fout' | 'klaar';

export type Knipper = {
  /** Milliseconden tot de volgende knipper. */
  over: number;
  /** Soms twee keer kort na elkaar, zoals echte ogen. */
  dubbel: boolean;
  /** Hoe lang het oog dicht is (ms): 70-110. */
  dicht: number;
};

export type Blik = {
  /** Milliseconden tot de volgende blik. */
  over: number;
  /** Richting in px binnen het 64-vak (klein: ±2,6 x, ±1 y). */
  x: number;
  y: number;
  /** Hoe snel het oog springt (ms); een saccade is kort. */
  sprong: number;
};

const tussen = (rnd: () => number, a: number, b: number) => a + (b - a) * rnd();

/** Knippert hij nog? Bij een fout zijn de ogen dicht/gezakt: niet knipperen. */
export function knippertOoit(stemming: Stemming): boolean {
  return stemming !== 'fout';
}

/**
 * Volgende knipper. Rust: 2,4-6,8 s; wachten iets vaker (ongeduld); werken
 * iets minder vaak (geconcentreerd). ~18% dubbel.
 */
export function volgendeKnipper(stemming: Stemming, rnd: () => number = Math.random): Knipper {
  const [a, b] = stemming === 'wacht' ? [1800, 4600] : stemming === 'werkt' ? [3200, 7600] : [2400, 6800];
  // Twee trekkingen gemiddeld: meer in het midden, minder extremen (geen
  // twee knippers vlak na elkaar behalve de bedoelde dubbele).
  const over = Math.round((tussen(rnd, a, b) + tussen(rnd, a, b)) / 2);
  return { over, dubbel: rnd() < 0.18, dicht: Math.round(tussen(rnd, 70, 110)) };
}

/**
 * Volgende blik. Werken: vaak en snel heen en weer (leest mee). Rust: af en
 * toe ergens heen, en meestal weer terug naar het midden. Wacht: kijkt naar
 * jou (iets omhoog). Fout: geen blikken, de ogen hangen.
 */
export function volgendeBlik(stemming: Stemming, rnd: () => number = Math.random): Blik | null {
  if (stemming === 'fout') return null;
  if (stemming === 'werkt') {
    return {
      over: Math.round(tussen(rnd, 420, 1300)),
      x: Math.round(tussen(rnd, -2.6, 2.6) * 10) / 10,
      y: Math.round(tussen(rnd, -0.4, 0.6) * 10) / 10,
      sprong: Math.round(tussen(rnd, 90, 150)),
    };
  }
  const terug = rnd() < 0.45;
  return {
    over: Math.round(tussen(rnd, 1400, stemming === 'wacht' ? 3200 : 4800)),
    x: terug ? 0 : Math.round(tussen(rnd, -2.2, 2.2) * 10) / 10,
    y: terug ? 0 : Math.round(tussen(rnd, stemming === 'wacht' ? -1 : -0.8, 0.5) * 10) / 10,
    sprong: Math.round(tussen(rnd, 140, 240)),
  };
}
