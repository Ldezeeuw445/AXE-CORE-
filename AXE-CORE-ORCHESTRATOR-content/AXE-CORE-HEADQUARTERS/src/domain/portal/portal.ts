/**
 * Portal (Luka, 18 nov 2026 -- het idee uit Canopy, in AXE's vorm): kies op
 * de iPhone een foto, video, bestand of je klembord, veeg het van het scherm
 * af, en het landt op de Mac waar je zit. Puur, geen I/O.
 */

/** Supabase-limiet van de bucket axe-portal (migratie 20261119090000). */
export const PORTAL_MAX_BYTES = 50 * 1024 * 1024;
/** "Waar ik nu ben": een Mac pakt een worp naar 'alle' alleen als Luka er net iets deed. */
export const ACTIEF_BINNEN_S = 120;
/** Ouder dan dit en nog niet opgehaald: niet meer laten landen (je bent het vergeten). */
export const VERS_BINNEN_MS = 24 * 3600 * 1000;

export interface PortalRij {
  id: string;
  created_at: string;
  van: string;
  naar: string;
  soort: 'bestand' | 'tekst';
  naam: string;
  mime: string;
  grootte: number;
  pad: string | null;
  tekst: string | null;
  opgehaald_door: string | null;
  opgehaald_at: string | null;
}

/** Een kale, veilige bestandsnaam (zelfde regels als portal_veilige_naam in lib.rs). */
export function veiligeNaam(naam: string): string {
  // eslint-disable-next-line no-control-regex
  const schoon = naam.replace(/[/\\:\u0000-\u001f\u007f]/g, '_').trim().replace(/^\.+/, '').slice(0, 120);
  return schoon || 'portal-bestand';
}

export function opslagPad(id: string, naam: string): string {
  return `${id}/${veiligeNaam(naam)}`;
}

/**
 * Moet deze Mac deze worp ophalen?
 * - al opgehaald of te oud: nee;
 * - expliciet naar deze Mac: ja;
 * - naar 'alle' ("waar ik nu ben"): alleen als Luka hier de laatste
 *   ACTIEF_BINNEN_S seconden iets deed. Weet de Mac het niet (stilS null),
 *   dan wel -- liever twee keer dan nergens.
 */
export function isVoorMij(rij: PortalRij, mijnId: string, stilS: number | null, nu = Date.now()): boolean {
  if (rij.opgehaald_at) return false;
  if (nu - new Date(rij.created_at).getTime() > VERS_BINNEN_MS) return false;
  if (rij.naar === mijnId) return true;
  if (rij.naar !== 'alle') return false;
  return stilS === null || stilS < ACTIEF_BINNEN_S;
}

/**
 * Is dit een worp? Ver genoeg naar links, of snel naar links.
 * dx in px (negatief = links), vx in px/ms.
 */
export function isWorp(dx: number, vx: number): boolean {
  return dx < -110 || (dx < -35 && vx < -0.55);
}

export function grootteTekst(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} kB`;
  return `${(bytes / (1024 * 1024)).toFixed(bytes < 10 * 1024 * 1024 ? 1 : 0)} MB`;
}

/** Wat de notch zegt als iets landt. */
export function landTekst(rij: Pick<PortalRij, 'soort' | 'naam' | 'tekst' | 'van'>): { titel: string; tekst: string } {
  const van = rij.van ? ` van ${rij.van}` : '';
  if (rij.soort === 'tekst') {
    const t = (rij.tekst ?? '').replace(/\s+/g, ' ').trim();
    return { titel: `Klembord${van}`, tekst: t.length > 70 ? `${t.slice(0, 69)}…` : t || '(leeg)' };
  }
  return { titel: `Geland${van}`, tekst: rij.naam };
}
