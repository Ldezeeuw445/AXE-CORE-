import { describe, expect, it } from 'vitest';
import { laatsteWaarde, macroRegels } from './macro';

const cat = [
  { dataset: 'fx', symbol: 'EUR/USD', name: 'Euro Dollar' },
  { dataset: 'macro', symbol: 'US.CRUDE.INV', name: 'US Crude Oil Inventories' },
  { dataset: 'macro', symbol: 'EU.CPI', name: 'Euro area CPI' },
  { dataset: 'macro', symbol: 'US.CRUDE.INV', name: 'US Crude Oil Inventories' },
  { dataset: 'commodity', symbol: 'BDI', name: 'Baltic Dry Index' },
  { dataset: 'stocks', symbol: 'AAPL', name: 'Apple Inc CPI ' },
];

describe('macroRegels', () => {
  it('pakt macro, slaat prijsdatasets en dubbelen over', () => {
    const r = macroRegels(cat);
    expect(r.map(x => x.symbol)).toEqual(['US.CRUDE.INV', 'EU.CPI', 'BDI']);
  });

  it('respecteert het maximum, want elke reeks kost een download', () => {
    expect(macroRegels(cat, undefined, 2)).toHaveLength(2);
  });
});

describe('laatsteWaarde', () => {
  it('neemt de nieuwste rij en onthoudt de vorige', () => {
    const w = laatsteWaarde([{ date: '2026-09-01', value: 10 }, { date: '2026-09-08', value: 12 }]);
    expect(w).toEqual({ datum: '2026-09-08', waarde: 12, vorige: 10 });
  });

  it('laat rijen zonder getal weg in plaats van ze als nul te tellen', () => {
    const w = laatsteWaarde({ data: [{ date: '2026-09-01', value: 5 }, { date: '2026-09-08', value: null }] });
    expect(w?.waarde).toBe(5);
    expect(laatsteWaarde([])).toBeNull();
  });
});
