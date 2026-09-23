import { describe, it, expect } from 'vitest';
import {
  isLimietFout, limietTijdstip, koelingTot, koeltNog, koelingTekst, STANDAARD_KOELING_MS,
} from './gebruikslimiet';

/** De echte regel van 13 september 2026, ingekort tot wat ertoe doet. */
const CODEX = "ERROR: You've hit your usage limit. Upgrade to Pro "
  + '(https://chatgpt.com/explore/pro), visit https://chatgpt.com/codex/settings/usage '
  + 'to purchase more credits or try again at 5:36 PM.';

describe('een limiet herkennen', () => {
  it('herkent de melding van codex', () => {
    expect(isLimietFout(CODEX)).toBe(true);
  });

  it('herkent de gangbare varianten', () => {
    expect(isLimietFout('HTTP 429 Too Many Requests')).toBe(true);
    expect(isLimietFout('quota exceeded for this key')).toBe(true);
  });

  it('houdt een echte storing buiten de koeling', () => {
    // Een storing die als limiet telt zou een uur lang onzichtbaar zijn, en
    // dat is precies het soort stilte waar dit project last van had.
    expect(isLimietFout('Not inside a trusted directory')).toBe(false);
    expect(isLimietFout('connection refused op poort 8001')).toBe(false);
    expect(isLimietFout('de limiet van dit vak is 8 terminals')).toBe(false);
  });
});

describe('tot wanneer', () => {
  it('leest het tijdstip dat de dienst zelf noemt', () => {
    const nu = new Date('2026-09-13T14:38:00');
    expect(new Date(limietTijdstip(CODEX, nu)!).getHours()).toBe(17);
    expect(new Date(limietTijdstip(CODEX, nu)!).getMinutes()).toBe(36);
  });

  it('legt een tijdstip dat al voorbij is op morgen', () => {
    // Om 23:50 te horen "probeer om 00:30" gaat over vannacht, niet gisteren.
    const nu = new Date('2026-09-13T23:50:00');
    const tot = limietTijdstip('try again at 12:30 AM', nu)!;
    expect(tot).toBeGreaterThan(nu.getTime());
    expect(new Date(tot).getDate()).toBe(14);
  });

  it('valt terug op een uur als er geen tijd in staat', () => {
    const nu = new Date('2026-09-13T14:38:00');
    expect(koelingTot('usage limit reached', nu)).toBe(nu.getTime() + STANDAARD_KOELING_MS);
  });

  it('negeert onzin in plaats van een rare tijd te verzinnen', () => {
    expect(limietTijdstip('try again at 99:99', new Date())).toBeNull();
  });
});

describe('koeling', () => {
  it('koelt tot het tijdstip en daarna niet meer', () => {
    const nu = new Date('2026-09-13T14:38:00');
    const tot = koelingTot(CODEX, nu);
    expect(koeltNog(tot, nu)).toBe(true);
    expect(koeltNog(tot, new Date('2026-09-13T17:37:00'))).toBe(false);
  });

  it('koelt nooit op een lege stand', () => {
    expect(koeltNog(undefined, new Date())).toBe(false);
  });

  it('noemt de klok in de zin die je te zien krijgt', () => {
    const tot = new Date('2026-09-13T17:36:00').getTime();
    expect(koelingTekst('codex', tot)).toContain('17:36');
  });
});
