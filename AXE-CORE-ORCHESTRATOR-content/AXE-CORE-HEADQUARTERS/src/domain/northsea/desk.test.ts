import { describe, expect, it } from 'vitest';
import {
  commissieTekst, dealId, dealRijen, deskTellers, faseLabel, getal, tegenpartijen, volumeTekst,
} from './desk';
import type { KaartDeal } from './kaart';

const NU = Date.parse('2026-09-14T20:00:00Z');
const deal = (d: Partial<KaartDeal>): KaartDeal => ({ id: 'a1b2c3d4-0000', stage: 'identified', execution_state: 'qualifying', ...d });

describe('de dealtabel', () => {
  it('toont de dealcode, en anders het begin van de id -- nooit een verzonnen nummer', () => {
    expect(dealId(deal({ code: 'DEAL-001' }))).toBe('DEAL-001');
    expect(dealId(deal({ code: 'high' }))).toBe('#a1b2c3');
  });

  it('een lege commissie is een streepje, een percentage blijft een percentage', () => {
    expect(commissieTekst(deal({}))).toBe('—');
    expect(commissieTekst(deal({ commissie_pct: '1' }))).toBe('1%');
    expect(commissieTekst(deal({ commissie_bedrag: '1200000', commissie_pct: '1' }))).toBe('$1.2M');
  });

  it('leest numeric-tekst uit Postgres, en maakt van leeg geen 0', () => {
    expect(getal('600')).toBe(600);
    expect(getal('')).toBeNull();
    expect(getal(null)).toBeNull();
    expect(volumeTekst(deal({ volume_mt: '50000' }))).toBe('50,000 MT');
    expect(volumeTekst(deal({}))).toBe('—');
  });

  it('maakt van de uitvoeringsstand leesbare tekst', () => {
    expect(faseLabel(deal({ execution_state: 'parallel_qualification_active' }))).toBe('Parallel qualification active');
    expect(faseLabel(deal({ execution_state: null, stage: 'verifying' }))).toBe('Verifying');
  });

  it('zet leverancier voor koper, want de goederen gaan die kant op', () => {
    expect(tegenpartijen(deal({ leverancier: 'Mopani', koper: 'Qinzhou Metals' }))).toBe('Mopani → Qinzhou Metals');
    expect(tegenpartijen(deal({ koper: 'Qinzhou Metals' }))).toBe('Qinzhou Metals');
  });

  it('sorteert op laatst bijgewerkt, en een gematchte deal is pipeline maar niet actief', () => {
    const deals = [
      deal({ id: 'oud', updated_at: '2026-09-10T00:00:00Z' }),
      deal({ id: 'nieuw', updated_at: '2026-09-14T00:00:00Z' }),
      deal({ id: 'match', execution_state: 'matched', updated_at: '2026-09-14T10:00:00Z' }),
    ];
    expect(dealRijen(deals, 'actief').map(d => d.id)).toEqual(['nieuw', 'oud']);
    expect(dealRijen(deals, 'pipeline').map(d => d.id)).toEqual(['match', 'nieuw', 'oud']);
    expect(dealRijen(deals, 'afgerond')).toEqual([]);
  });
});

describe('de kaartjes', () => {
  const deals = [
    deal({ id: '1', code: 'DEAL-001', akkoord_nodig: true, created_at: '2026-09-12T00:00:00Z' }),
    deal({ id: '2', product: 'Rice', akkoord_nodig: true, geblokkeerd: true, created_at: '2026-08-01T00:00:00Z' }),
    deal({ id: '3', execution_state: 'matched', geblokkeerd: true }),
    deal({ id: '4', stage: 'won' }),
    deal({ id: '5', stage: 'lost', geblokkeerd: true, akkoord_nodig: true }),
  ];
  const t = deskTellers(deals, NU);

  it('telt actief, pipeline en afgerond zoals de tabbladen', () => {
    expect([t.actief, t.pipeline, t.afgerond]).toEqual([2, 3, 1]);
    expect(t.nieuwDezeWeek).toBe(1);
  });

  it('noemt bij wachten op akkoord de code, anders het product; verloren deals tellen niet', () => {
    expect(t.akkoord).toBe(2);
    expect(t.akkoordNamen).toEqual(['DEAL-001', 'Rice']);
    expect(t.geblokkeerd).toBe(2);
  });

  it('zegt "geen commissie" in plaats van $0 als er niets is ingevuld', () => {
    expect(t.commissie).toBeNull();
    expect(deskTellers([deal({ commissie_bedrag: '250000' })], NU).commissie).toBe(250000);
  });
});
