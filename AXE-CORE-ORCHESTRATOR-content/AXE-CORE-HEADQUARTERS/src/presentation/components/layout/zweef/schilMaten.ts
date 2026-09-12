/**
 * De maten van de schil die een zwever nodig heeft om zijn plek te kiezen:
 * waar de band ophoudt en hoe hoog het chroom onderin is.
 *
 * AxeShellChrome MEET die maten en zet ze als tokens op <html>; hier worden ze
 * alleen gelezen. Rekenen kan niet: de band heeft een plafond en de composer
 * groeit mee met wat erin staat. De terugvalwaarden zijn de gemeten waarden op
 * 1728x1080, voor de eerste render voordat de schil gemeten heeft.
 */
import { useEffect, useState } from 'react';
import type { Maat } from './zweefPositie';

export interface SchilMaten {
  venster: Maat;
  /** Linkerkant van de band (chatplaat, composer), in px vanaf links. */
  bandLinks: number;
  /** Rechterkant van de band, in px vanaf links -- dus venster.b - marge. */
  bandRechts: number;
  /** Hoogte van het chroom onderin (nav en composer), vanaf de onderrand. */
  onderChroom: number;
}

export const TERUGVAL = { bandMarge: 287, onderChroom: 204 } as const;

/** '287px' -> 287; alles wat geen getal is wordt de terugval. */
export function leesPx(waarde: string | null | undefined, terugval: number): number {
  if (!waarde) return terugval;
  const n = parseFloat(waarde);
  return Number.isFinite(n) && n > 0 ? n : terugval;
}

export function schilMaten(venster: Maat, tokens: { chatLinks?: string | null; chatRechts?: string | null; railOnder?: string | null }): SchilMaten {
  const links = leesPx(tokens.chatLinks, TERUGVAL.bandMarge);
  const rechts = leesPx(tokens.chatRechts, TERUGVAL.bandMarge);
  return {
    venster,
    bandLinks: links,
    bandRechts: venster.b - rechts,
    onderChroom: leesPx(tokens.railOnder, TERUGVAL.onderChroom),
  };
}

function meet(): SchilMaten {
  const venster: Maat = { b: window.innerWidth, h: window.innerHeight };
  const cs = getComputedStyle(document.documentElement);
  return schilMaten(venster, {
    chatLinks: cs.getPropertyValue('--axe-chat-links'),
    chatRechts: cs.getPropertyValue('--axe-chat-rechts'),
    railOnder: cs.getPropertyValue('--axe-rail-onder'),
  });
}

/**
 * De maten, opnieuw gemeten bij resize -- twee frames later, want de schil
 * meet zichzelf ook op resize en die meting moet er eerst staan.
 */
export function useSchilMaten(): SchilMaten {
  const [m, setM] = useState<SchilMaten>(meet);
  useEffect(() => {
    let raf = 0;
    const bij = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => { raf = requestAnimationFrame(() => setM(meet())); });
    };
    window.addEventListener('resize', bij);
    bij();
    return () => { window.removeEventListener('resize', bij); cancelAnimationFrame(raf); };
  }, []);
  return m;
}
