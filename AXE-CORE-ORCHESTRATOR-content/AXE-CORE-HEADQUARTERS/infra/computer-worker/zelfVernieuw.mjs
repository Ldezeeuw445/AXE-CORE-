/* De worker draait nieuwe code zonder herstart van de Mac (24 nov).

   Autosync haalt elke 5 min orchestrator op, maar een lopend node-proces houdt
   zijn oude code tot iemand het herstart. Op de iMac draaide zo de worker van
   03:08 nog uren na de fixes voor stoel-limieten; de Mac mini had ze alleen
   omdat hij herstartte. Daarom: bij de start een vingerafdruk van de eigen
   .mjs-bestanden; verandert die, dan stopt de worker tussen twee taken in
   (nooit midden in een agent-run) en start launchd (KeepAlive) hem opnieuw. */

import { readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

/** mtime+grootte van alle niet-test .mjs-bestanden in `map`, als één string. */
export function vingerafdruk(map) {
  try {
    return readdirSync(map)
      .filter(n => n.endsWith('.mjs') && !n.includes('.test.'))
      .sort()
      .map(n => {
        const s = statSync(join(map, n));
        return `${n}:${s.size}:${Math.round(s.mtimeMs)}`;
      })
      .join('|');
  } catch {
    return '';
  }
}

/** Een afdruk die te lezen was en anders is dan bij de start. Onleesbaar = niet stoppen. */
export function codeVeranderd(map, bijStart) {
  if (!bijStart) return false;
  const nu = vingerafdruk(map);
  return Boolean(nu) && nu !== bijStart;
}
