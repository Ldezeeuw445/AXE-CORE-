/**
 * De stand van een vermogen: werkt het nu, en zo niet, wat doe je eraan.
 *
 * Zelfde opzet als providerCardStand: de vertaling van "wat is er gemeten" naar
 * "wat zie je" is een pure functie, want dat is het stuk dat fout gaat en het
 * enige stuk dat je zonder scherm kunt testen.
 *
 * Luka's regel: groen als het werkt, rood als het faalt, en bij rood staat
 * erbij WAAROM en wat je eraan doet. "Connected" zonder kleur is geen antwoord,
 * en rood zonder remedie is een klacht.
 */

export type Vermogen = 'computer' | 'browser';
export type Stand = 'laden' | 'aan' | 'uit';

export interface VermogenBeeld {
  stand: Stand;
  /** Eén regel onder de naam. Bij 'uit' zegt hij wat er mis is. */
  tekst: string;
  /** Alleen bij 'uit': wat Luka zelf kan doen. */
  remedie?: string;
  kleur: string;
}

const GROEN = 'var(--success, #34d399)';
const ROOD = 'var(--danger, #f87171)';
const GRIJS = 'var(--text-muted)';

/**
 * De computer-relay: een werker op de Mac checkt elke paar tellen in. Geen
 * ingecheckte werker betekent niet "kapot" maar "het proces draait niet", en
 * dat verschil bepaalt de remedie.
 */
export function computerBeeld(hosts: string[] | null): VermogenBeeld {
  if (hosts === null) return { stand: 'laden', tekst: 'kijken…', kleur: GRIJS };
  if (hosts.length === 0) {
    return {
      stand: 'uit',
      tekst: 'geen werker ingecheckt',
      remedie: 'start de computer-werker op de Mac',
      kleur: ROOD,
    };
  }
  return { stand: 'aan', tekst: hosts.join(' · '), kleur: GROEN };
}

/**
 * De browser draait op de VPS (headless Chromium), niet op deze Mac. Hij hangt
 * dus aan de API en niet aan een lokaal proces -- vandaar een andere vraag dan
 * bij de computer.
 */
export function browserBeeld(apiBereikbaar: boolean | null, hostNaam = 'VPS'): VermogenBeeld {
  if (apiBereikbaar === null) return { stand: 'laden', tekst: 'kijken…', kleur: GRIJS };
  if (!apiBereikbaar) {
    return {
      stand: 'uit',
      /* De naam erbij, want anders zoek je op de verkeerde machine. Sinds de
         host te kiezen is, is "de API antwoordt niet" een halve mededeling. */
      tekst: `${hostNaam} antwoordt niet`,
      remedie: hostNaam === 'VPS'
        ? 'kijk op de VPS of axe-core-api draait'
        : `kijk of de browser-dienst op ${hostNaam} draait, of kies de VPS`,
      kleur: ROOD,
    };
  }
  return { stand: 'aan', tekst: `draait op ${hostNaam}`, kleur: GROEN };
}
