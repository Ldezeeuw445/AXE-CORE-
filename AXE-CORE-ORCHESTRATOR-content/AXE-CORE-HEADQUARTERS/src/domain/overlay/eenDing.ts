/**
 * Eén ding vandaag (Luka, 18 nov 2026 -- uit Spazio, in AXE's vorm). Bovenaan
 * Home in de notch: niet een lijst, maar het ene ding dat vandaag telt.
 * Puur, geen I/O.
 *
 * Volgorde:
 *  1. wat Luka zelf voor vandaag heeft vastgezet (wint altijd, ook als het af is);
 *  2. zijn oudste open stap waar híj aan de beurt is (GET /stappen, jouw_beurt,
 *     zonder de goedkeuringen -- die hebben hun eigen regel);
 *  3. openstaande goedkeuringen: dan kan AXE door;
 *  4. rust: niets moet, kies zelf.
 */

export interface EigenDing { datum: string; tekst: string; klaar: boolean }
export interface Stap { id?: string | null; titel?: string | null; wie?: string | null; status?: string | null; sinds?: string | null }

export type EenDingBron = 'eigen' | 'stap' | 'goedkeuring' | 'rust';
export interface EenDing {
  bron: EenDingBron;
  tekst: string;
  uitleg: string;
  klaar: boolean;
  tab?: 'approvals';
}

/** Sleutel voor vandaag in Luka's eigen tijd (niet UTC: om 00:30 is het al morgen). */
export function datumSleutel(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export const EEN_DING_SLEUTEL = (d: Date) => `axe_een_ding_${datumSleutel(d)}`;

function dagenOpen(sinds: string | null | undefined, nu: Date): number {
  const t = sinds ? new Date(sinds).getTime() : NaN;
  if (!Number.isFinite(t)) return 0;
  return Math.max(0, Math.floor((nu.getTime() - t) / 86_400_000));
}

export function kiesEenDing(eigen: EigenDing | null, jouwBeurt: Stap[], goedkeuringen: number, nu: Date, bereikbaar = true): EenDing {
  if (eigen && eigen.datum === datumSleutel(nu) && eigen.tekst.trim()) {
    return { bron: 'eigen', tekst: eigen.tekst.trim(), uitleg: eigen.klaar ? 'Gedaan — de rest is bonus' : 'Door jou gekozen', klaar: eigen.klaar };
  }
  const stappen = jouwBeurt
    .filter((s) => s.status !== 'waiting_approval' && (s.titel ?? '').trim())
    .sort((a, b) => String(a.sinds ?? '9').localeCompare(String(b.sinds ?? '9')));
  if (stappen.length) {
    const s = stappen[0];
    const d = dagenOpen(s.sinds, nu);
    const nog = stappen.length > 1 ? ` · nog ${stappen.length - 1} daarna` : '';
    return { bron: 'stap', tekst: String(s.titel).trim(), uitleg: `${d === 0 ? 'Vandaag binnen' : d === 1 ? 'Sinds gisteren open' : `Al ${d} dagen open`}${nog}`, klaar: false };
  }
  if (goedkeuringen > 0) {
    return { bron: 'goedkeuring', tekst: goedkeuringen === 1 ? 'Eén ding goedkeuren' : `${goedkeuringen} dingen goedkeuren`,
      uitleg: 'Dan kan AXE zelf verder', klaar: false, tab: 'approvals' };
  }
  if (!bereikbaar) {
    // Zonder verbinding weten we het niet; "niets moet" zou kunnen liegen.
    return { bron: 'rust', tekst: 'Kies zelf je ene ding', uitleg: 'Geen verbinding — AXE ziet nu niet wat er openstaat', klaar: false };
  }
  return { bron: 'rust', tekst: 'Niets moet vandaag', uitleg: 'Kies zelf je ene ding', klaar: false };
}
