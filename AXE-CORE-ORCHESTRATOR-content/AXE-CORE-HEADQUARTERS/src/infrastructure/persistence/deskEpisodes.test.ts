/**
 * closeDeskEpisodesForTrade tegen een nagebootste Supabase-tabel: welke
 * episode wordt gesloten, en met welk oordeel.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

type Row = { id: string; agent: string; subject: string; verdict: string; opened_at: string; user_id: string };
const db = vi.hoisted(() => ({ rows: [] as Row[], updates: [] as Array<{ id: string; verdict: string; note: string }> }));

function builder() {
  let filtered = [...db.rows];
  let pendingUpdate: Record<string, unknown> | null = null;
  const b = {
    select: () => b,
    eq: (col: string, val: unknown) => {
      if (pendingUpdate && col === 'id') {
        db.updates.push({ id: String(val), verdict: String(pendingUpdate.verdict), note: String(pendingUpdate.outcome_note) });
        return Promise.resolve({ error: null });
      }
      filtered = filtered.filter(r => (r as Record<string, unknown>)[col] === val);
      return b;
    },
    like: (col: string, pat: string) => {
      const prefix = pat.replace(/%$/, '');
      filtered = filtered.filter(r => String((r as Record<string, unknown>)[col]).startsWith(prefix));
      return b;
    },
    lte: (col: string, val: string) => { filtered = filtered.filter(r => String((r as Record<string, unknown>)[col]) <= val); return b; },
    order: () => { filtered.sort((a, z) => z.opened_at.localeCompare(a.opened_at)); return b; },
    limit: (n: number) => Promise.resolve({ data: filtered.slice(0, n), error: null }),
    update: (u: Record<string, unknown>) => { pendingUpdate = u; return b; },
  };
  return b;
}

vi.mock('@/infrastructure/supabase/supabaseClient', () => ({
  getSupabase: () => ({ from: () => builder() }),
  currentUserId: async () => 'u1',
}));
vi.mock('@/infrastructure/gateways/axeCoreApiService', () => ({ sbGetRows: vi.fn(), sbUpdateRow: vi.fn() }));

import { closeDeskEpisodesForTrade } from './agentFeedbackService';

const ago = (min: number) => new Date(Date.now() - min * 60_000).toISOString();

beforeEach(() => {
  db.updates = [];
  // 22-23 sep 2026: 'intel'/'companion' hernoemd naar 'trading-desk-intel'/
  // 'trading-desk-companion' zodat Trading's eigen desk-lane-simulatie niet
  // langer dezelfde loop-agent-identiteit deelt met de echte AXE Intel/AXE
  // Companion product-agents (zie agentLoop.ts).
  db.rows = [
    { id: 'i-old', agent: 'trading-desk-intel', subject: 'XAUUSD|long', verdict: 'unknown', opened_at: ago(300), user_id: 'u1' },
    { id: 'i-new', agent: 'trading-desk-intel', subject: 'XAUUSD|short', verdict: 'unknown', opened_at: ago(130), user_id: 'u1' },
    { id: 'i-after', agent: 'trading-desk-intel', subject: 'XAUUSD|long', verdict: 'unknown', opened_at: ago(10), user_id: 'u1' },
    { id: 'c-1', agent: 'trading-desk-companion', subject: 'XAUUSD|long', verdict: 'unknown', opened_at: ago(125), user_id: 'u1' },
    { id: 'other', agent: 'trading-desk-intel', subject: 'EURUSD|long', verdict: 'unknown', opened_at: ago(200), user_id: 'u1' },
  ];
});

describe('closeDeskEpisodesForTrade', () => {
  it('scoort per lane de laatste lezing vóór de opening, tegen de marktrichting', async () => {
    // Long geopend 120 min geleden, verloor: markt ging omlaag.
    const res = await closeDeskEpisodesForTrade({ symbol: 'xauusd', side: 'buy', pnl: -50, holdingMinutes: 120 });
    expect(res.closed).toBe(2);
    expect(db.updates).toEqual([
      expect.objectContaining({ id: 'i-new', verdict: 'good' }),   // Intel zei SHORT: goed
      expect.objectContaining({ id: 'c-1', verdict: 'poor' }),     // Companion zei LONG: fout
    ]);
    // Een lezing van ná de opening kon de beslissing niet beïnvloeden en wordt niet gescoord.
    expect(db.updates.some(u => u.id === 'i-after')).toBe(false);
  });

  it('breakeven zegt niets over de richting: niets gesloten', async () => {
    expect((await closeDeskEpisodesForTrade({ symbol: 'XAUUSD', side: 'buy', pnl: 0, holdingMinutes: 120 })).closed).toBe(0);
    expect(db.updates).toEqual([]);
  });
});
