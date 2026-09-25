/**
 * Wat AXE over Luka weet, als één blok voor de prompt van elke beurt.
 *
 * Relevant voor deze beurt eerst (dat is waar hij het nu over heeft), dan wat
 * hij onlangs vertelde, dan het vaste profiel. Dubbelingen eruit, en een harde
 * lengtegrens: een prompt vol herinneringen maakt elke beurt trager.
 */
export function bouwGeheugenBlok(
  relevant: string[],
  recent: string[],
  profiel: string[],
  maxTekens = 1_800,
): string {
  const gezien = new Set<string>();
  const regels: string[] = [];
  let lengte = 0;
  for (const r of [...relevant, ...recent, ...profiel]) {
    const t = r.replace(/\s+/g, ' ').trim();
    const sleutel = t.toLowerCase();
    if (!t || gezien.has(sleutel)) continue;
    const regel = `- ${t.slice(0, 280)}`;
    if (lengte + regel.length > maxTekens) break;
    gezien.add(sleutel);
    regels.push(regel);
    lengte += regel.length + 1;
  }
  if (!regels.length) return '';
  return `What you remember about Luka (use it naturally when it fits, never recite it):\n${regels.join('\n')}`;
}
