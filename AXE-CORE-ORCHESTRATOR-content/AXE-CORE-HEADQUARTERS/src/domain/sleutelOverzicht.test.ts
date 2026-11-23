import { describe, expect, it } from 'vitest';
import { type KeyRow, type KeysPerApp, sleutelFixes, sleutelKpis, sleutelPil, verbruikTekst } from './sleutelOverzicht';

const k = (p: Partial<KeyRow>): KeyRow => ({ name: 'A_KEY', purpose: 'Managers', status: 'present', ...p });
const u = (p: Partial<NonNullable<KeyRow['usage']>>) => ({
  calls_today: 0, ok_today: 0, failed_today: 0, limited_today: 0, tokens_today: 0,
  calls_yesterday: 0, calls_7d: 0, last_status: null, last_at: null, ...p,
});
const app = (keys: KeyRow[]): KeysPerApp => ({ keys });

describe('sleutelOverzicht', () => {
  it('een echte aanroep vandaag maakt van Set een Works; 402 is No credits', () => {
    expect(sleutelPil(k({ usage: u({ calls_today: 3, ok_today: 3, calls_7d: 3, last_status: 200 }) })).tekst).toBe('Works');
    expect(sleutelPil(k({ usage: u({ last_status: 402 }) })).tekst).toBe('No credits');
    expect(sleutelPil(k({ usage: u({ last_status: 429 }) })).tekst).toBe('Rate limited');
    expect(sleutelPil(k({})).tekst).toBe('Set');
  });

  it('verbruikstekst zegt eerlijk dat er nog niets geteld is', () => {
    expect(verbruikTekst(k({}))).toBe('No calls counted yet');
    expect(verbruikTekst(k({ usage: u({ calls_today: 4, ok_today: 3, limited_today: 1, calls_7d: 9 }) }))).toBe('4 today · 75% ok · 1 limited');
  });

  it('telt elke sleutel één keer, ook als twee apps hem delen', () => {
    const a = k({ name: 'A_KEY', usage: u({ calls_today: 5, ok_today: 5, calls_7d: 5, calls_yesterday: 2 }) });
    const kp = sleutelKpis([app([a]), app([a, k({ name: 'B_KEY', status: 'broken' })])]);
    expect(kp.totaal).toBe(2);
    expect(kp.vandaag).toBe(5);
    expect(kp.stuk).toBe(1);
  });

  it('Needs a fix: alleen verplicht en kapot, of geen tegoed', () => {
    const fixes = sleutelFixes([app([
      k({ name: 'OPT', status: 'broken', need: 'optional' }),
      k({ name: 'REQ', status: 'missing', need: 'required' }),
      k({ name: 'CRED', usage: u({ last_status: 402 }) }),
    ])]);
    expect(fixes.map((f) => f.naam)).toEqual(['REQ', 'CRED']);
  });
});
