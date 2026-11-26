import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const bron = (naam: string) => readFileSync(join(__dirname, naam), 'utf8');

/**
 * 26 nov: de tier-2-route had een eigen prompt en kreeg "Wie Luka is", het
 * sessiegeheugen, de stem en het bureau niet mee. Elke chatroute leest nu
 * persoonlijkeContext; dit houdt dat zo.
 */
describe('elke chatroute kent Luka', () => {
  it.each(['installStableChat.ts', 'voiceStore.ts', 'installTierRouter.ts'])('%s gebruikt persoonlijkeContext', (f) => {
    expect(bron(f)).toMatch(/persoonlijkeContext\(text\)/);
  });

  it('geen route zet de blokken nog los in elkaar (dan valt er weer een tussendoor)', () => {
    for (const f of ['installStableChat.ts', 'voiceStore.ts', 'installTierRouter.ts']) {
      expect(bron(f), f).not.toMatch(/profielContext\(\)/);
      expect(bron(f), f).not.toMatch(/stemContext\(text\)/);
    }
  });

  it('snelle routes lezen AXON alleen bij een herinneringsvraag', () => {
    for (const f of ['installStableChat.ts', 'installTierRouter.ts']) {
      expect(bron(f), f).toMatch(/vraagOmHerinnering\(text\)\s*\?\s*(?:await )?raceFirstToken\(axonContext/);
    }
  });
});
