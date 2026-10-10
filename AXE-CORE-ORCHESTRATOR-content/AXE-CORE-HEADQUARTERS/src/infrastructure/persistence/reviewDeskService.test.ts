import { describe, expect, it, vi } from 'vitest';
vi.mock('@/infrastructure/supabase/supabaseClient', () => ({ getSupabase: vi.fn(), currentUserId: vi.fn() }));
import { currentUserId, getSupabase } from '@/infrastructure/supabase/supabaseClient';
import { loadReviewDesk, observationAge, reviewDeskSchema, saveReviewDesk } from './reviewDeskService';

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

describe('CAS-schrijfpad', () => {
  const expected = { ownerId: 'test-owner', rowUpdatedAt: '2026-10-05T06:00:00Z', snapshot: reviewDeskSchema.parse(sample) };
  function mockDb(conflict = false, altered = false) {
    let stored = { value: sample, updated_at: expected.rowUpdatedAt };
    const query = { update: vi.fn(), select: vi.fn(), eq: vi.fn(), abortSignal: vi.fn(), maybeSingle: vi.fn() };
    query.update.mockImplementation(payload => { if (!conflict) stored = payload; return query; });
    query.select.mockReturnValue(query); query.eq.mockReturnValue(query); query.abortSignal.mockReturnValue(query);
    query.maybeSingle.mockResolvedValueOnce({ data: conflict ? null : { updated_at: 'written' }, error: null })
      .mockImplementation(async () => ({ data: altered ? { ...stored, value: { ...sample, summary: 'Other writer' } } : stored, error: null }));
    vi.mocked(getSupabase).mockReturnValue({ from: () => query } as unknown as ReturnType<typeof getSupabase>);
    vi.mocked(currentUserId).mockResolvedValue('test-owner');
    return query;
  }
  it('vernieuwt DB-versie en behoudt oude metingen bij teruggelezen succes', async () => {
    const q = mockDb();
    const result = await saveReviewDesk(sample, expected);
    expect(result.ok).toBe(true);
    expect(q.eq).toHaveBeenCalledWith('user_id', expected.ownerId);
    expect(q.eq).toHaveBeenCalledWith('key', 'axe_website_review_desk_v1');
    expect(q.eq).toHaveBeenCalledWith('updated_at', expected.rowUpdatedAt);
    const payload = q.update.mock.calls[0][0];
    expect(Date.parse(payload.updated_at)).toBeGreaterThan(Date.parse(expected.rowUpdatedAt));
    expect(payload.value.metrics).toEqual(sample.metrics);
    expect(q.maybeSingle).toHaveBeenCalledTimes(2);
  });
  it('herleest conflict zonder tweede schrijf- of insertpoging', async () => {
    const q = mockDb(true);
    expect(await saveReviewDesk(sample, expected)).toMatchObject({ ok: false, reason: 'conflict' });
    expect(q.update).toHaveBeenCalledTimes(1);
  });
  it('weigert schemafout vóór databaseverkeer', async () => {
    const q = mockDb();
    expect(await saveReviewDesk({ ...sample, schemaVersion: 2 }, expected)).toEqual({ ok: false, reason: 'invalid_schema' });
    expect(q.update).not.toHaveBeenCalled();
  });
  it('weigert een andere eigenaar vóór schrijven', async () => {
    const q = mockDb(); vi.mocked(currentUserId).mockResolvedValue('other-owner');
    expect(await saveReviewDesk(sample, expected)).toEqual({ ok: false, reason: 'session_changed' });
    expect(q.update).not.toHaveBeenCalled();
  });
  it('meldt een tussentijdse andere write als conflict', async () => {
    mockDb(false, true);
    expect(await saveReviewDesk(sample, expected)).toMatchObject({ ok: false, reason: 'conflict' });
  });
  it('meldt opslagfout zonder blind te herhalen', async () => {
    const q = mockDb(); q.maybeSingle.mockReset().mockResolvedValue({ data: null, error: { message: 'offline' } });
    await expect(saveReviewDesk(sample, expected)).rejects.toThrow('could not be saved');
    expect(q.update).toHaveBeenCalledTimes(1);
  });
});
