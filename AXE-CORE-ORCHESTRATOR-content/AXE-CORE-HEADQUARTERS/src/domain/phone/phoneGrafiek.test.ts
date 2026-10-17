import { describe, expect, it } from 'vitest';
import { brokerFoutTekst, menselijkeBrokerFout, sparkLijn, sparkPunten } from './phoneGrafiek';

describe('phoneGrafiek', () => {
  it('tekent de lockscreen-spark, of een vlakke lijn van de laatste koers', () => {
    expect(sparkPunten([4180, 4181, 4179], 4181)).toEqual([4180, 4181, 4179]);
    expect(sparkPunten([], 4181.1)).toEqual([4181.1, 4181.1]);
    expect(sparkPunten(undefined)).toEqual([]);
  });

  it('maakt een SVG-pad dat in het vak past', () => {
    const pad = sparkLijn([1, 2, 1], 100, 40);
    expect(pad.startsWith('M')).toBe(true);
    expect(pad).toContain('L');
    expect(sparkLijn([1], 100, 40)).toBe('');
  });

  it('vertaalt MetaAPI-quota-JSON naar paused, nooit de ruwe fout', () => {
    const raw = 'positions 429: {"error":"MetaAPI quota was exceeded — backing off, and nothing cached for this call yet"}';
    expect(menselijkeBrokerFout(raw)).toBe('paused');
    expect(brokerFoutTekst(raw)).toBe('Positions paused.');
    expect(brokerFoutTekst(raw)).not.toMatch(/429|quota was exceeded|\{/);
  });
});
