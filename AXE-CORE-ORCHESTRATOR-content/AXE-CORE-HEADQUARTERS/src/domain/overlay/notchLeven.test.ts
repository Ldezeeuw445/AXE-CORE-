import { describe, expect, it } from 'vitest';
import { beoordeelNotch, type NotchSignalen, type NotchToestand } from './notchLeven';

/** Alles stil en bereikbaar: het vertrekpunt waar elke test één ding aan verandert. */
const RUSTIG: NotchSignalen = {
  luistert: false,
  denkt: false,
  bereikbaar: true,
  approvals: 0,
  taken: 0,
};

const met = (p: Partial<NotchSignalen>) => beoordeelNotch({ ...RUSTIG, ...p });

describe('de notch zegt wat er aan de hand is', () => {
  it('rust is rust: geen woord, maar wel een uitleg', () => {
    const l = met({});
    expect(l.toestand).toBe('rust');
    expect(l.woord).toBe('');
    expect(l.uitleg).not.toBe('');
    expect(l.dringend).toBe(false);
  });

  it('elke toestand heeft een eigen woord en uitleg', () => {
    const gevallen: Array<[NotchToestand, Partial<NotchSignalen>]> = [
      ['luistert', { luistert: true }],
      ['denkt', { denkt: true }],
      ['onbereikbaar', { bereikbaar: false }],
      ['wacht', { approvals: 2 }],
      ['werkt', { taken: 3 }],
    ];
    const woorden = new Set<string>();
    for (const [verwacht, signalen] of gevallen) {
      const l = met(signalen);
      expect(l.toestand).toBe(verwacht);
      expect(l.woord).not.toBe('');
      expect(l.uitleg).not.toBe('');
      woorden.add(l.woord);
    }
    // Twee toestanden met hetzelfde woord zijn voor Luka één toestand.
    expect(woorden.size).toBe(gevallen.length);
  });
});

describe('welke toestand wint als er meer tegelijk waar is', () => {
  it('praten gaat boven alles — anders praat je tegen een strook die zwijgt', () => {
    expect(met({ luistert: true, denkt: true, bereikbaar: false, approvals: 4, taken: 9 }).toestand)
      .toBe('luistert');
  });

  it('een antwoord dat je zelf vroeg gaat boven de tellers', () => {
    expect(met({ denkt: true, approvals: 4, taken: 9 }).toestand).toBe('denkt');
  });

  it('geen verbinding gaat boven de tellers, want die zijn dan oud', () => {
    // Dit is het geval waarvoor dit bestand bestaat: zonder deze regel blijft
    // "3 bezig" staan terwijl er niets meer draait en niets het tegenspreekt.
    const l = met({ bereikbaar: false, approvals: 4, taken: 3 });
    expect(l.toestand).toBe('onbereikbaar');
    expect(l.dringend).toBe(true);
  });

  it('approvals gaan boven lopende taken: die vragen iets van jou', () => {
    const l = met({ approvals: 1, taken: 7 });
    expect(l.toestand).toBe('wacht');
    expect(l.telling).toBe(1);
    expect(l.dringend).toBe(true);
  });

  it('lopende taken melden alleen, dus niet dringend', () => {
    const l = met({ taken: 7 });
    expect(l.toestand).toBe('werkt');
    expect(l.telling).toBe(7);
    expect(l.dringend).toBe(false);
  });
});

describe('enkelvoud, meervoud en rommel uit de API', () => {
  it('één approval krijgt enkelvoud, twee meervoud', () => {
    expect(met({ approvals: 1 }).uitleg).toContain('1 approval wacht');
    expect(met({ approvals: 2 }).uitleg).toContain('2 approvals wachten');
  });

  it('één taak krijgt enkelvoud, twee meervoud', () => {
    expect(met({ taken: 1 }).uitleg).toBe('1 taak loopt');
    expect(met({ taken: 2 }).uitleg).toBe('2 taken lopen');
  });

  it('een negatief, gebroken of onbekend getal telt als niets', () => {
    // Een teller komt uit een HTTP-antwoord. `-1 bezig` of `NaN wacht op jou`
    // in de balk boven je scherm is erger dan geen melding.
    expect(met({ taken: -3 }).toestand).toBe('rust');
    expect(met({ approvals: Number.NaN }).toestand).toBe('rust');
    expect(met({ taken: 2.7 }).telling).toBe(2);
  });
});
