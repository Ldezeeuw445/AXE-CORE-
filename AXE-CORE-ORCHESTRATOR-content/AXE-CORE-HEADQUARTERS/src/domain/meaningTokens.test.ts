import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { meaningVar, meaningVarDim, type Meaning } from './meaning';

/**
 * Elke betekenis moet een kleur hebben die echt bestaat.
 *
 * meaningVar() maakt `var(--m-happened)` en die tokens waren nooit
 * gedefinieerd. CSS geeft daar geen fout op -- het valt terug op de geërfde
 * kleur -- dus stond er op 24 plekken grijze tekst waar groen of rood hoorde,
 * en niets in de code wees erop. Luka zag het aan de kaarten: "connected is
 * ook nog niet groen en failed nog niet rood".
 *
 * Dit is de reden dat deze test de STYLESHEET leest en niet de functie: de
 * functie deed altijd al precies wat er stond.
 */
const CSS = readFileSync('src/app/index.css', 'utf8');
const BETEKENISSEN: Meaning[] = ['happened', 'budget', 'broken', 'structure', 'idle'];

/** Haalt de naam uit `var(--m-happened)`. */
function tokenNaam(verwijzing: string): string {
  const m = verwijzing.match(/var\((--[a-z0-9-]+)\)/);
  expect(m, `geen var() in "${verwijzing}"`).toBeTruthy();
  return m![1];
}

describe('betekenis-kleuren bestaan', () => {
  it.each(BETEKENISSEN)('%s heeft een gedefinieerde kleur', (betekenis) => {
    const naam = tokenNaam(meaningVar(betekenis));
    expect(CSS, `${naam} wordt gebruikt maar nergens gedefinieerd`).toContain(`${naam}:`);
  });

  it.each(BETEKENISSEN)('%s heeft ook een dim-variant', (betekenis) => {
    const naam = tokenNaam(meaningVarDim(betekenis));
    expect(CSS, `${naam} wordt gebruikt maar nergens gedefinieerd`).toContain(`${naam}:`);
  });

  it('werkt en mislukt zijn niet dezelfde kleur', () => {
    // De hele reden dat je kleur gebruikt.
    expect(meaningVar('happened')).not.toBe(meaningVar('broken'));
  });
});
