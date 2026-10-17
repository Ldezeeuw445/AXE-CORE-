import { describe, expect, it } from 'vitest';
import { groepeerTelefoonDeals } from './phoneDeals';
import type { PipelineDeal } from '@/domain/northsea/tabs/typen';

const deal = (over: Partial<PipelineDeal> & { id: string }): PipelineDeal => ({
  product: 'Copper Cathode',
  koper: 'Buyer A',
  leverancier: 'Seller A',
  execution_state: 'matched',
  ...over,
});

describe('groepeerTelefoonDeals', () => {
  it('vouwt dezelfde deal-code tot één kaart', () => {
    const uit = groepeerTelefoonDeals([
      deal({ id: '1', code: 'DEAL-002', updated_at: '2026-10-17T10:00:00Z' }),
      deal({ id: '2', code: 'DEAL-002', updated_at: '2026-10-17T12:00:00Z', volume_mt: 500, waarde: 1_200_000 }),
    ], Date.parse('2026-10-17T13:00:00Z'));
    expect(uit).toHaveLength(1);
    expect(uit[0].id).toBe('2');
    expect(uit[0].aantal).toBe(2);
    expect(uit[0].hoeveel).toMatch(/500/);
    expect(uit[0].hoeveel).toMatch(/\$1\.2M/);
  });

  it('houdt verschillende tegenpartijen uit elkaar', () => {
    const uit = groepeerTelefoonDeals([
      deal({ id: 'a', koper: 'Alice' }),
      deal({ id: 'b', koper: 'Bob' }),
    ]);
    expect(uit).toHaveLength(2);
  });

  it('markeert needs-OK', () => {
    const uit = groepeerTelefoonDeals([deal({ id: 'x', akkoord_nodig: true })]);
    expect(uit[0].okNodig).toBe(true);
  });
});
