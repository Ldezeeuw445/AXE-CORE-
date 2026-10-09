/**
 * De dag als lijst voor een telefoon: wat er staat, leesbaar, in de volgorde van de dag.
 *
 * Het weekrooster is zeven kolommen van 40px op een scherm van 384: elke afspraak een blokje waar de
 * titel niet in past (Luka, 9 okt: "de blokken waarin je niet kan lezen waar het blok voor is"). Een
 * telefoon heeft hoogte om te geven, geen breedte -- dus één dag tegelijk, elke afspraak een kaart
 * met zijn volle titel.
 *
 * Een cronjob die elk kwartier draait is niet 96 kaarten maar één: "axe-cron-collect · 96×".
 * Herhalingen (dezelfde titel, soort en kleur, drie keer of vaker op één dag) worden samengevoegd
 * en klappen open naar hun tijden.
 */
import { minutenVan, type RoosterItem } from './weekRooster';

export interface DagGroep {
  id: string;
  titel: string;
  kleur: string;
  soort: string;
  app?: RoosterItem['app'];
  /** Alle starttijden, op volgorde ("HH:MM"). Bij één afspraak is dat er één. */
  tijden: string[];
  /** Duur van de eerste, in minuten. */
  duurMin: number;
  aantal: number;
}

/** Vanaf hoeveel keer op één dag een herhaling samengevoegd wordt. */
export const HERHALING_VANAF = 3;

export function dagGroepen(items: RoosterItem[], datum: string): DagGroep[] {
  const vandaag = items
    .filter(i => i.datum === datum && minutenVan(i.tijd) !== null)
    .sort((a, b) => (minutenVan(a.tijd)! - minutenVan(b.tijd)!) || a.titel.localeCompare(b.titel));

  const perSoort = new Map<string, RoosterItem[]>();
  for (const i of vandaag) {
    const sleutel = `${i.titel}\u0000${i.soort}\u0000${i.kleur}`;
    const l = perSoort.get(sleutel);
    if (l) l.push(i); else perSoort.set(sleutel, [i]);
  }

  const uit: DagGroep[] = [];
  for (const lijst of perSoort.values()) {
    if (lijst.length >= HERHALING_VANAF) {
      const eerste = lijst[0];
      uit.push({
        id: `groep:${eerste.id}`, titel: eerste.titel, kleur: eerste.kleur, soort: eerste.soort, app: eerste.app,
        tijden: lijst.map(i => i.tijd), duurMin: eerste.duurMin, aantal: lijst.length,
      });
    } else {
      for (const i of lijst) {
        uit.push({
          id: i.id, titel: i.titel, kleur: i.kleur, soort: i.soort, app: i.app,
          tijden: [i.tijd], duurMin: i.duurMin, aantal: 1,
        });
      }
    }
  }
  return uit.sort((a, b) => (minutenVan(a.tijden[0])! - minutenVan(b.tijden[0])!) || a.titel.localeCompare(b.titel));
}

/** 09:00 + 45 min -> "09:00 – 09:45"; zonder duur alleen de tijd. */
export function tijdSpan(tijd: string, duurMin: number): string {
  const min = minutenVan(tijd);
  if (min === null || duurMin <= 0) return tijd;
  const eind = min + duurMin;
  return `${tijd} – ${String(Math.floor(eind / 60) % 24).padStart(2, '0')}:${String(eind % 60).padStart(2, '0')}`;
}

/** "elke 15 min" / "elk uur" uit de tijden van een herhaling; leeg als er geen vast ritme is. */
export function ritme(tijden: string[]): string {
  if (tijden.length < 3) return '';
  const m = tijden.map(t => minutenVan(t)).filter((x): x is number => x !== null);
  const stappen = new Set(m.slice(1).map((x, i) => x - m[i]));
  if (stappen.size !== 1) return '';
  const s = [...stappen][0];
  if (s <= 0) return '';
  if (s % 60 === 0) return s === 60 ? 'every hour' : `every ${s / 60} h`;
  return `every ${s} min`;
}
