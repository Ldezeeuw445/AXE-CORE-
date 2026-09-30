/**
 * De stand van de Core. Dit was een geneste ternary van vijf diep in Home.tsx
 * die alleen naar de stem keek: draaide er een agent, dan stond er 'idle'.
 */
import { describe, it, expect } from 'vitest';
import { coreStandVan } from './coreStand';

const stil = { lopend: 0, wacht: 0 };

describe('coreStandVan', () => {
  it('niets aan de hand is idle', () => {
    expect(coreStandVan('idle', false, stil)).toBe('idle');
  });

  /* De regel die deze ronde toevoegt: stil aan deze kant, maar er wordt
     gewerkt. Dat is niet hetzelfde als niets doen. */
  it('achtergrondwerk bij een stille AXE is geen idle', () => {
    expect(coreStandVan('idle', false, { lopend: 1, wacht: 0 })).toBe('thinking');
  });

  it('een wachtende goedkeuring gaat voor alles -- daar moet jij iets doen', () => {
    expect(coreStandVan('speaking', false, { lopend: 2, wacht: 1 })).toBe('awaiting-approval');
    expect(coreStandVan('idle', true, stil)).toBe('awaiting-approval');
  });

  it('wat jij zegt gaat voor wat hij doet', () => {
    expect(coreStandVan('listening', false, { lopend: 3, wacht: 0 })).toBe('listening');
  });

  it('praten en denken houden hun eigen stand, ook met werk erbij', () => {
    expect(coreStandVan('speaking', false, { lopend: 1, wacht: 0 })).toBe('speaking');
    expect(coreStandVan('processing', false, { lopend: 1, wacht: 0 })).toBe('thinking');
  });
});
