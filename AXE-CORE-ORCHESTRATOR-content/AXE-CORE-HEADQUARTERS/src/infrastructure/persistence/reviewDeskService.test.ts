import { describe, expect, it, vi } from 'vitest';
vi.mock('@/infrastructure/supabase/supabaseClient', () => ({ getSupabase: vi.fn(), currentUserId: vi.fn() }));
import { currentUserId, getSupabase } from '@/infrastructure/supabase/supabaseClient';
import { loadReviewDesk, observationAge, reviewDeskSchema } from './reviewDeskService';

const sample = { schemaVersion: 1, updatedAt: '2026-10-05T06:00:00Z', summary: 'Test report', metrics: [{ label: 'Reach', value: null, unit: 'count', asOf: '2026-10-04T06:00:00Z', source: 'Not measured' }], leads: [], channels: [], sections: [], actions: [], links: [] };
describe('privérapport Website Review Desk', () => {
  it('behoudt onbekend en nul als verschillende waarnemingen', () => {
    expect(reviewDeskSchema.parse(sample).metrics[0].value).toBeNull();
    expect(reviewDeskSchema.parse({ ...sample, metrics: [{ ...sample.metrics[0], value: 0 }] }).metrics[0].value).toBe(0);
  });
  it('weigert uitvoerbare links en ongeldige datums', () => {
    expect(reviewDeskSchema.safeParse({ ...sample, links: [{ label: 'Unsafe', url: 'javascript:alert(1)' }] }).success).toBe(false);
    expect(reviewDeskSchema.safeParse({ ...sample, updatedAt: 'yesterday' }).success).toBe(false);
  });
  it('berekent ouderdom uit waarneming, niet uit ophalen', () => {
    expect(observationAge('2026-10-04T06:00:00Z', Date.parse('2026-10-06T06:00:00Z'))).toBe('2d old');
  });
  it('laadt geen gegevens zonder ingelogde eigenaar', async () => {
    const from = vi.fn();
    vi.mocked(getSupabase).mockReturnValue({ from } as unknown as ReturnType<typeof getSupabase>);
    vi.mocked(currentUserId).mockResolvedValue(null);
    await expect(loadReviewDesk()).rejects.toThrow('Sign in');
    expect(from).not.toHaveBeenCalled();
  });
  it('begrenst op eigenaar en geeft een leesfout nooit als leeg rapport terug', async () => {
    const query = { select: vi.fn(), eq: vi.fn(), abortSignal: vi.fn(), maybeSingle: vi.fn().mockResolvedValue({ data: null, error: { message: 'offline' } }) };
    query.select.mockReturnValue(query); query.eq.mockReturnValue(query); query.abortSignal.mockReturnValue(query);
    vi.mocked(getSupabase).mockReturnValue({ from: () => query } as unknown as ReturnType<typeof getSupabase>);
    vi.mocked(currentUserId).mockResolvedValue('test-owner');
    await expect(loadReviewDesk()).rejects.toThrow('could not be loaded');
    expect(query.eq).toHaveBeenCalledWith('user_id', 'test-owner');
  });
});
