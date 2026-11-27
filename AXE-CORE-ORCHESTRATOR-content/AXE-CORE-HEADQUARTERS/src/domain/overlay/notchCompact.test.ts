import { describe, expect, it } from 'vitest';
import { FOUT_VENSTER_MS, GROET_MS, compacteStand, foutZin, groet, magOpnieuw, stapRijen, verdeelTaken, wachtZin } from './notchCompact';

const basis = { gesleept: false, bereikbaar: true, mislukt: 0, actief: 0, openSindsMs: GROET_MS + 1 };

describe('compacteStand', () => {
  it('volgorde: gesleept > fout > werkt > groet > rust', () => {
    expect(compacteStand({ ...basis, gesleept: true, bereikbaar: false, actief: 3 })).toBe('gesleept');
    expect(compacteStand({ ...basis, bereikbaar: false, actief: 3 })).toBe('fout');
    expect(compacteStand({ ...basis, mislukt: 1, actief: 3 })).toBe('fout');
    expect(compacteStand({ ...basis, actief: 2, openSindsMs: 0 })).toBe('werkt');
    expect(compacteStand({ ...basis, openSindsMs: 100 })).toBe('groet');
    expect(compacteStand(basis)).toBe('rust');
  });

  it('groet per dagdeel', () => {
    expect(groet(3)).toMatch(/Still up/);
    expect(groet(9)).toMatch(/morning/);
    expect(groet(14)).toMatch(/afternoon/);
    expect(groet(21)).toMatch(/evening/);
  });
});

describe('verdeelTaken', () => {
  const nu = Date.parse('2026-11-27T14:00:00Z');
  it('actief en mislukt binnen 2 uur; oud mislukt valt weg', () => {
    const { actief, mislukt } = verdeelTaken([
      { id: 'a', title: 'Build', status: 'running', assignee: 'developer' },
      { id: 'b', title: 'Wacht', status: 'waiting_approval', assignee: 'northseamgr' },
      { id: 'c', title: 'Kapot', status: 'failed', updated_at: new Date(nu - 60_000).toISOString(), error: { message: 'timeout' } },
      { id: 'd', title: 'Oud', status: 'failed', updated_at: new Date(nu - FOUT_VENSTER_MS - 1).toISOString() },
      { id: 'e', title: 'Klaar', status: 'succeeded' },
    ], nu);
    expect(actief.map((t) => t.id)).toEqual(['a', 'b']);
    expect(mislukt.map((t) => t.id)).toEqual(['c']);
    expect(mislukt[0].fout).toBe('timeout');
    expect(actief[0].wie).toBe('developer');
  });
});

describe('stapRijen', () => {
  const s = (n: number, status: string) => ({ id: `s${n}`, volgorde: n, titel: `Stap ${n}`, status });
  it('max 3 rijen rond de stap van nu', () => {
    const r = stapRijen([s(1, 'done'), s(2, 'done'), s(3, 'done'), s(4, 'running'), s(5, 'pending'), s(6, 'pending')]);
    expect(r.map((x) => x.id)).toEqual(['s3', 's4', 's5']);
    expect(r.map((x) => x.merk)).toEqual(['klaar', 'nu', 'straks']);
  });
  it('mislukt telt als de stap van nu, en sorteert op volgorde', () => {
    const r = stapRijen([s(2, 'failed'), s(1, 'done')]);
    expect(r.map((x) => x.merk)).toEqual(['klaar', 'mislukt']);
  });
});

describe('magOpnieuw: nooit trades, betalingen, sends, deploys of merges', () => {
  it.each([
    'Place trade EURUSD', 'Pay invoice', 'SEPA transfer', 'Send email to buyer', 'Deploy HQ',
    'Merge PR 12', 'Publish post', 'Buy domain', 'Release 2.1',
  ])('%s → nee', (titel) => {
    expect(magOpnieuw({ titel })).toBe(false);
  });
  it('lezen, bouwen, samenvatten mag', () => {
    expect(magOpnieuw({ titel: 'Summarise NorthSea inbox' })).toBe(true);
    expect(magOpnieuw({ titel: 'Run lint', capability: 'project-check' })).toBe(true);
  });
  it('kijkt ook naar de capability', () => {
    expect(magOpnieuw({ titel: 'Step 3', capability: 'gmail.send' })).toBe(false);
  });
});

describe('teksten', () => {
  it('foutZin offline en bij een mislukte taak', () => {
    expect(foutZin(false, []).titel).toMatch(/can't reach/);
    const z = foutZin(true, [{ id: 'x', titel: 'Build', status: 'failed', wie: '', fout: 'npm ERR' }, { id: 'y', titel: 'b', status: 'failed', wie: '' }]);
    expect(z.titel).toBe("Build didn't finish (+1 more)");
    expect(z.reden).toBe('npm ERR');
  });
  it('wachtZin', () => {
    expect(wachtZin(0)).toBe('Nothing waiting on you');
    expect(wachtZin(1)).toBe('1 thing waiting on you');
    expect(wachtZin(3)).toBe('3 things waiting on you');
  });
});
