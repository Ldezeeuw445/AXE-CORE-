/**
 * Wat de notch over zichzelf vertelt.
 *
 * ## Waarom dit nodig is
 *
 * Ingeklapt is de notch een strook van 80px met knoppen en een bol. Hij zag
 * er altijd hetzelfde uit: of AXE meeluisterde, nadacht, achter de schermen
 * twaalf taken draaide of al een uur de VPS niet meer haalde — dezelfde
 * strook. Een altijd-aanwezige balk die niets zegt, is een lampje zonder
 * draad: je weet nooit of AXE er nog is.
 *
 * Het gevaarlijkste geval is de laatste. Als de VPS niet antwoordt, houdt de
 * notch zijn laatste lijstje vast, en "niets te doen" is dan niet rust maar
 * stilte. Daarom is `bereikbaar` een eigen signaal en geen bijzaak: een dode
 * notch mag er niet uitzien als een rustige.
 *
 * ## Waarom het hier staat en niet in de component
 *
 * De volgorde is de hele logica: welke van vijf dingen mag je zien als er
 * drie tegelijk waar zijn. In een component kun je die volgorde alleen
 * toetsen door te renderen, en deze suite draait zonder DOM (zie
 * `vitest.config.ts`). Hier is elk geval één regel.
 */

/**
 * Alle toestanden, in de volgorde waarin ze elkaar verslaan.
 *
 * Een lijst en niet alleen een type: een type bestaat niet meer als de code
 * draait, dus een test kan er niet langs om te controleren of elke toestand
 * ook echt getekend wordt. Zie `AxeOverlayNotch.leven.test.ts`.
 */
export const NOTCH_TOESTANDEN = [
  'luistert',
  'denkt',
  'onbereikbaar',
  'wacht',
  'werkt',
  'rust',
] as const;

export type NotchToestand = (typeof NOTCH_TOESTANDEN)[number];

export interface NotchSignalen {
  /** De microfoon staat open. */
  luistert: boolean;
  /** AXE is nu een antwoord aan het maken. */
  denkt: boolean;
  /** De laatste ronde haalde de VPS. Bij false is al het andere oud. */
  bereikbaar: boolean;
  /** Approvals die op Luka wachten. */
  approvals: number;
  /** Achtergrondtaken die lopen. */
  taken: number;
}

export interface NotchLeven {
  toestand: NotchToestand;
  /** Eén of twee woorden naast de bol. Leeg bij rust: dan zegt de bol het. */
  woord: string;
  /** De hele uitleg — tooltip en schermlezer. Nooit leeg. */
  uitleg: string;
  /** Het getal vóór het woord, of null. */
  telling: number | null;
  /** Vraagt iets van Luka, in plaats van hem alleen iets te melden. */
  dringend: boolean;
}

/** Een teller uit een API mag geen -1, 1.5 of NaN de UI in duwen. */
function heelGetal(n: number): number {
  return Number.isFinite(n) ? Math.max(0, Math.trunc(n)) : 0;
}

/**
 * Eén toestand uit alle signalen.
 *
 * De volgorde, van hoog naar laag, en waarom:
 *
 *  1. `luistert` — je staat te praten. Blijft die terugkoppeling weg, dan
 *     praat je tegen een strook die misschien niets opneemt.
 *  2. `denkt` — je wacht op een antwoord dat je zelf hebt gevraagd.
 *  3. `onbereikbaar` — boven de twee tellers, want die zijn dan oud. Eronder
 *     zetten zou betekenen dat "3 bezig" blijft staan terwijl er niets meer
 *     draait.
 *  4. `wacht` — approvals vragen iets van jou en lopen niet zelf af.
 *  5. `werkt` — AXE doet iets, jij hoeft niets.
 *  6. `rust` — niets te melden. Niet hetzelfde als stil.
 */
export function beoordeelNotch(s: NotchSignalen): NotchLeven {
  const approvals = heelGetal(s.approvals);
  const taken = heelGetal(s.taken);

  if (s.luistert) {
    return {
      toestand: 'luistert',
      woord: 'luistert',
      uitleg: 'De microfoon staat open',
      telling: null,
      dringend: false,
    };
  }

  if (s.denkt) {
    return {
      toestand: 'denkt',
      woord: 'denkt',
      uitleg: 'AXE maakt een antwoord',
      telling: null,
      dringend: false,
    };
  }

  if (!s.bereikbaar) {
    return {
      toestand: 'onbereikbaar',
      woord: 'geen verbinding',
      uitleg: 'De VPS antwoordt niet — wat hier staat kan oud zijn',
      telling: null,
      dringend: true,
    };
  }

  if (approvals > 0) {
    return {
      toestand: 'wacht',
      woord: 'wacht op jou',
      uitleg:
        approvals === 1
          ? '1 approval wacht op jouw besluit'
          : `${approvals} approvals wachten op jouw besluit`,
      telling: approvals,
      dringend: true,
    };
  }

  if (taken > 0) {
    return {
      toestand: 'werkt',
      woord: 'bezig',
      uitleg: taken === 1 ? '1 taak loopt' : `${taken} taken lopen`,
      telling: taken,
      dringend: false,
    };
  }

  return {
    toestand: 'rust',
    woord: '',
    uitleg: 'AXE is er — niets te doen',
    telling: null,
    dringend: false,
  };
}
