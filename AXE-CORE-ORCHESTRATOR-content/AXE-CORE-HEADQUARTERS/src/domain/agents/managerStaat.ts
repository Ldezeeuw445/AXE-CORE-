/**
 * Eén statusregel per manager (BOUWLIJST "Eerst", punt 8 -- 19 nov 2026).
 *
 * Altijd zichtbaar wat een manager nu doet: luistert / denkt / taak draait /
 * wacht op jou. Tot nu toe stond het verspreid over chips, puntjes en een
 * label in de lijst, en "luistert" stond nergens. Eén functie, zodat de lijst
 * en het chatvenster nooit iets anders zeggen.
 *
 * Volgorde = belang: wat op Luka wacht gaat altijd voor, dan wat hij nu zelf
 * doet (praten), dan het werk.
 */

export type ManagerStaat = 'wacht' | 'luistert' | 'taak' | 'denkt' | 'rust';

export interface ManagerStaatInvoer {
  /** Open goedkeuringen of een taak die op Luka wacht. */
  wachtOpJou: number;
  /** De microfoon staat aan in DIT managervenster. */
  luistert: boolean;
  /** Titel van de taak die nu draait (lokaal of op de server), of null. */
  taak: string | null;
  /** Er komt een antwoord aan (abonnement denkt na). */
  denkt: boolean;
  /** Mislukt bij de laatste taak, als er verder niets speelt. */
  mislukt?: string | null;
}

export interface ManagerStaatRegel {
  staat: ManagerStaat | 'mislukt';
  /** De regel bovenin het venster (UI = Engels, AGENTS.md). */
  tekst: string;
  /** Kort label voor de lijst links; zelfde staat, minder woorden. */
  label: string;
}

function kort(s: string, n = 48): string {
  const t = s.replace(/\s+/g, ' ').trim();
  return t.length <= n ? t : `${t.slice(0, n - 1)}…`;
}

export function managerStaat(i: ManagerStaatInvoer): ManagerStaatRegel {
  if (i.wachtOpJou > 0) {
    return {
      staat: 'wacht', label: 'Needs you',
      tekst: i.wachtOpJou === 1 ? 'Waiting on you' : `Waiting on you (${i.wachtOpJou})`,
    };
  }
  if (i.luistert) return { staat: 'luistert', label: 'Listening', tekst: 'Listening…' };
  if (i.taak) return { staat: 'taak', label: 'Working', tekst: `Task running: ${kort(i.taak)}` };
  if (i.denkt) return { staat: 'denkt', label: 'Thinking', tekst: 'Thinking…' };
  if (i.mislukt) return { staat: 'mislukt', label: 'Failed', tekst: `Failed: ${kort(i.mislukt)}` };
  return { staat: 'rust', label: 'Ready', tekst: 'Ready' };
}
