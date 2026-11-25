/**
 * Kleine reeks voor de NorthSea-desk (25 nov, Luka: KPI's met een lijntje).
 * Telt per dag hoeveel acties, taken, concepten en bounces er ontstonden. Uit
 * dezelfde /northsea/overzicht die de desk al haalt; geen tweede bron.
 */
type MetTijd = { created_at?: string | null; updated_at?: string | null };

export function activiteitPerDag(rijen: ReadonlyArray<MetTijd>, nu: number, dagen = 14): number[] {
  const vak = new Array<number>(dagen).fill(0);
  const eindVanDag = new Date(nu);
  eindVanDag.setHours(23, 59, 59, 999);
  const eind = eindVanDag.getTime();
  for (const r of rijen) {
    const t = Date.parse(r.created_at ?? r.updated_at ?? '');
    if (!Number.isFinite(t) || t > eind) continue;
    const terug = Math.floor((eind - t) / 86_400_000);
    if (terug < dagen) vak[dagen - 1 - terug] += 1;
  }
  return vak;
}
