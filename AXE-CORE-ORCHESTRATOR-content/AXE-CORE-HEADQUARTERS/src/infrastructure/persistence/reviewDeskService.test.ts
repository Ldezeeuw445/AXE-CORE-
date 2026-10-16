import { describe, expect, it, vi } from 'vitest';
vi.mock('@/infrastructure/supabase/supabaseClient', () => ({ getSupabase: vi.fn(), currentUserId: vi.fn() }));
import { currentUserId, getSupabase } from '@/infrastructure/supabase/supabaseClient';
import {
  loadReviewDesk,
  loadReviewDeskRow,
  observationAge,
  reviewDeskSchema,
  saveReviewDesk,
} from './reviewDeskService';

const metricAsOf = '2026-10-04T06:00:00Z';
const sample = {
  schemaVersion: 1 as const,
  updatedAt: '2026-10-05T06:00:00Z',
  summary: 'Test report',
  metrics: [{ label: 'Reach', value: null, unit: 'count' as const, asOf: metricAsOf, source: 'Not measured' }],
  leads: [],
  channels: [],
  sections: [],
  actions: [],
  links: [],
};
const rowStamp = '2026-10-05T07:00:00.000Z';

function readChain(result: { data: unknown; error: unknown }) {
  const query = {
    select: vi.fn(),
    eq: vi.fn(),
    abortSignal: vi.fn(),
    maybeSingle: vi.fn().mockResolvedValue(result),
  };
  query.select.mockReturnValue(query);
  query.eq.mockReturnValue(query);
  query.abortSignal.mockReturnValue(query);
  return query;
}

function writeChain(result: { data: unknown; error: unknown }) {
  const query = {
    update: vi.fn(),
    eq: vi.fn(),
    select: vi.fn(),
    abortSignal: vi.fn(),
    maybeSingle: vi.fn().mockResolvedValue(result),
  };
  query.update.mockReturnValue(query);
  query.eq.mockReturnValue(query);
  query.select.mockReturnValue(query);
  query.abortSignal.mockReturnValue(query);
  return query;
}

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
    const query = readChain({ data: null, error: { message: 'offline' } });
    vi.mocked(getSupabase).mockReturnValue({ from: () => query } as unknown as ReturnType<typeof getSupabase>);
    vi.mocked(currentUserId).mockResolvedValue('test-owner');
    await expect(loadReviewDesk()).rejects.toThrow('could not be loaded');
    expect(query.eq).toHaveBeenCalledWith('user_id', 'test-owner');
  });
  it('leest row updated_at naast value', async () => {
    const query = readChain({ data: { value: sample, updated_at: rowStamp }, error: null });
    vi.mocked(getSupabase).mockReturnValue({ from: () => query } as unknown as ReturnType<typeof getSupabase>);
    vi.mocked(currentUserId).mockResolvedValue('test-owner');
    await expect(loadReviewDeskRow()).resolves.toEqual({
      snapshot: reviewDeskSchema.parse(sample),
      rowUpdatedAt: rowStamp,
    });
    expect(query.select).toHaveBeenCalledWith('value, updated_at');
  });
});

describe('CAS schrijfpad Website Review Desk', () => {
  it('slaagt bij match op eigenaar, sleutel en verwachte updated_at', async () => {
    const next = { ...sample, summary: 'Bijgewerkt', updatedAt: '2026-10-06T06:00:00Z' };
    const write = writeChain({ data: { value: next, updated_at: '2026-10-06T06:01:00.000Z' }, error: null });
    vi.mocked(getSupabase).mockReturnValue({ from: () => write } as unknown as ReturnType<typeof getSupabase>);
    vi.mocked(currentUserId).mockResolvedValue('test-owner');
    const outcome = await saveReviewDesk(next, rowStamp);
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(outcome.row.snapshot?.summary).toBe('Bijgewerkt');
    expect(write.update).toHaveBeenCalledWith({ value: reviewDeskSchema.parse(next) });
    expect(write.eq).toHaveBeenCalledWith('user_id', 'test-owner');
    expect(write.eq).toHaveBeenCalledWith('key', 'axe_website_review_desk_v1');
    expect(write.eq).toHaveBeenCalledWith('updated_at', rowStamp);
  });
  it('geeft conflict terug bij nul gewijzigde rijen en herleest de rij', async () => {
    const write = writeChain({ data: null, error: null });
    const read = readChain({
      data: { value: sample, updated_at: '2026-10-06T08:00:00.000Z' },
      error: null,
    });
    let fromCalls = 0;
    vi.mocked(getSupabase).mockReturnValue({
      from: () => (++fromCalls === 1 ? write : read),
    } as unknown as ReturnType<typeof getSupabase>);
    vi.mocked(currentUserId).mockResolvedValue('test-owner');
    const outcome = await saveReviewDesk({ ...sample, summary: 'Race' }, rowStamp);
    expect(outcome).toEqual({
      ok: false,
      reason: 'conflict',
      row: { snapshot: reviewDeskSchema.parse(sample), rowUpdatedAt: '2026-10-06T08:00:00.000Z' },
    });
    expect(write.update).toHaveBeenCalledTimes(1);
    expect(read.select).toHaveBeenCalledWith('value, updated_at');
  });
  it('weigert na sessiewissel vóór schrijven', async () => {
    vi.mocked(getSupabase).mockReturnValue({ from: vi.fn() } as unknown as ReturnType<typeof getSupabase>);
    vi.mocked(currentUserId)
      .mockResolvedValueOnce('test-owner')
      .mockResolvedValueOnce('other-account');
    const outcome = await saveReviewDesk({ ...sample, summary: 'X' }, rowStamp);
    expect(outcome).toEqual({
      ok: false,
      reason: 'session_changed',
      message: 'Your session changed. Refresh the report.',
    });
  });
  it('weigert ongeldige schema vóór enige database-aanroep', async () => {
    const from = vi.fn();
    vi.mocked(getSupabase).mockReturnValue({ from } as unknown as ReturnType<typeof getSupabase>);
    vi.mocked(currentUserId).mockResolvedValue('test-owner');
    const outcome = await saveReviewDesk({ ...sample, schemaVersion: 2 }, rowStamp);
    expect(outcome.ok).toBe(false);
    if (outcome.ok) return;
    expect(outcome.reason).toBe('invalid_schema');
    expect(from).not.toHaveBeenCalled();
  });
  it('behoudt oude waarnemingsdatums en bronnen in het opgeslagen snapshot', async () => {
    const next = {
      ...sample,
      summary: 'Alleen samenvatting gewijzigd',
      updatedAt: '2026-10-06T06:00:00Z',
      metrics: [{ label: 'Reach', value: null, unit: 'count' as const, asOf: metricAsOf, source: 'Not measured' }],
    };
    const write = writeChain({ data: { value: next, updated_at: '2026-10-06T06:01:00.000Z' }, error: null });
    vi.mocked(getSupabase).mockReturnValue({ from: () => write } as unknown as ReturnType<typeof getSupabase>);
    vi.mocked(currentUserId).mockResolvedValue('test-owner');
    const outcome = await saveReviewDesk(next, rowStamp);
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(outcome.row.snapshot?.metrics[0]).toEqual({
      label: 'Reach',
      value: null,
      unit: 'count',
      asOf: metricAsOf,
      source: 'Not measured',
    });
    expect(write.update).toHaveBeenCalledWith({
      value: expect.objectContaining({
        metrics: [expect.objectContaining({ asOf: metricAsOf, source: 'Not measured', value: null })],
      }),
    });
  });
});
