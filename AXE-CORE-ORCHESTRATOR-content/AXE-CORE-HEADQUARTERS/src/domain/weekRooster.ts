/**
 * Het rekenwerk achter een weekweergave.
 *
 * ## Waarom dit domeinlogica is
 *
 * Een week uitrekenen zit vol randgevallen die je niet ziet tot ze misgaan:
 * de week loopt van maandag maar getDay() begint op zondag, een maandgrens
 * valt middenin een week, en een afspraak van 09:00 tot 12:00 moet drie uur
 * hoog zijn en niet één rij. Dat hoort testbaar te zijn zonder browser.
 *
 * ## De afspraken
 *
 * De week begint op MAANDAG. getDay() geeft zondag 0, dus dat is niet "de
 * eerste dag min de dag van de week" -- op zondag zou je dan zes dagen vooruit
 * springen in plaats van één terug.
 *
 * Tijden zijn minuten sinds middernacht. Een string als "09:30" is prima om te
 * tonen maar niet om mee te rekenen: "10:00" < "9:30" als tekst.
 */

export interface RoosterItem {
  id: string;
  titel: string;
  /** YYYY-MM-DD */
  datum: string;
  /** HH:MM, 24 uur. */
  tijd: string;
  /** Hoe lang, in minuten. */
  duurMin: number;
  kleur: string;
  soort: string;
}

/** De maandag van de week waar deze datum in valt. */
export function maandagVan(d: Date): Date {
  const kopie = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  // getDay(): zondag 0 ... zaterdag 6. Voor maandag-als-eerste is zondag 6
  // terug en niet 1 vooruit.
  const terug = (kopie.getDay() + 6) % 7;
  kopie.setDate(kopie.getDate() - terug);
  return kopie;
}

/** De zeven dagen van die week, maandag eerst. */
export function weekDagen(anker: Date): Date[] {
  const ma = maandagVan(anker);
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(ma);
    d.setDate(ma.getDate() + i);
    return d;
  });
}

/** YYYY-MM-DD, in lokale tijd. */
export function datumSleutel(d: Date): string {
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${mm}-${dd}`;
}

/** "09:30" -> 570. Ongeldige tijd geeft null in plaats van NaN. */
export function minutenVan(tijd: string): number | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(tijd.trim());
  if (!m) return null;
  const u = Number(m[1]);
  const min = Number(m[2]);
  if (u > 23 || min > 59) return null;
  return u * 60 + min;
}

export interface Blokje {
  item: RoosterItem;
  /** Hoeveel uur vanaf de bovenkant van het rooster. */
  vanUur: number;
  /** Hoe hoog, in uren. Nooit kleiner dan een half uur. */
  hoogUur: number;
}

/**
 * De blokjes van één dag, binnen het zichtbare urenbereik.
 *
 * Buiten bereik valt weg in plaats van bovenaan te blijven plakken: een
 * afspraak om 03:00 die als 08:00 getekend wordt is erger dan een afspraak die
 * je niet ziet, want je gaat erop af.
 *
 * Een blokje is minimaal een half uur hoog. Een afspraak van tien minuten
 * wordt anders een streepje waar de titel niet in past.
 */
export function blokjesVoor(
  items: RoosterItem[],
  dag: string,
  vanUur: number,
  totUur: number,
): Blokje[] {
  const MIN_HOOG = 0.5;
  return items
    .filter(i => i.datum === dag)
    .map(i => {
      const min = minutenVan(i.tijd);
      if (min === null) return null;
      const start = min / 60;
      if (start < vanUur || start >= totUur) return null;
      const duur = Math.max(MIN_HOOG, (i.duurMin || 30) / 60);
      return {
        item: i,
        vanUur: start - vanUur,
        // Niet voorbij de onderkant tekenen: dan loopt het blok het rooster uit
        // en over wat eronder staat.
        hoogUur: Math.min(duur, totUur - start),
      };
    })
    .filter((b): b is Blokje => b !== null)
    .sort((a, b) => a.vanUur - b.vanUur);
}

/** Het urenbereik dat je moet tonen om alles van deze week te zien. */
export function urenBereik(
  items: RoosterItem[],
  dagen: string[],
  standaardVan = 8,
  standaardTot = 19,
): { van: number; tot: number } {
  const uren = items
    .filter(i => dagen.includes(i.datum))
    .map(i => minutenVan(i.tijd))
    .filter((m): m is number => m !== null)
    .map(m => m / 60);
  if (uren.length === 0) return { van: standaardVan, tot: standaardTot };
  // Een uur lucht aan de bovenkant, en de standaard blijft de ondergrens:
  // een week met alleen een lunchafspraak hoort geen rooster van één rij te
  // worden.
  return {
    van: Math.min(standaardVan, Math.floor(Math.min(...uren))),
    tot: Math.max(standaardTot, Math.ceil(Math.max(...uren)) + 1),
  };
}
