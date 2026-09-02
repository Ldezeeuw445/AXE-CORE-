/**
 * The brain writes where the trader reads, and reads its own namespace.
 *
 * It wrote to global_memory while `memory` held the same family of keys —
 * 10 995 against 5 564, measured 2026-08-27. Both calls succeeded, so nothing
 * surfaced. These assert the DESTINATION, which is the only thing that was
 * ever wrong.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// The mocks declare the argument they are called with. Written as
// `vi.fn(async () => …)` they take none, so `mock.calls[0][0]` is a type
// error on an empty tuple -- while the test does pass an argument and the
// assertions do read it. Naming it changes nothing at runtime and makes
// the test say what it actually does.
const remember = vi.fn(async (_entry: Record<string, unknown>) => true);
const recall = vi.fn(async () => [] as Array<Record<string, unknown>>);
const saveGlobalMemory = vi.fn(async () => {});

vi.mock('@/infrastructure/persistence/agentMemoryService', () => ({ remember, recall }));
vi.mock('@/infrastructure/persistence/globalMemoryService', () => ({ saveGlobalMemory }));
vi.mock('@/infrastructure/persistence/chatPersistence', () => ({ AXE_USER_ID: 'u-axe-core' }));

const brain = await import('./tradingAgentBrain');

beforeEach(() => { remember.mockClear(); recall.mockClear(); saveGlobalMemory.mockClear(); });

const arg = () => remember.mock.calls[0][0] as Record<string, unknown>;

describe('every namespace writes to the trader namespace', () => {
  it('a cycle', async () => {
    await brain.recordTrade({ id: 't1', symbol: 'EURUSD', action: 'buy', confidence: 0.7 } as never);
    expect(arg()).toMatchObject({ agent: 'axe_trader', kind: 'event', symbol: 'EURUSD' });
    expect(String(arg().key)).toContain(':cycle:t1');
  });

  it('a win, filed under win and not under loss', async () => {
    const bucket = await brain.recordOutcome({ tradeId: 't2', symbol: 'XAUUSD', pnl: 12 } as never);
    expect(bucket).toBe('win');
    expect(String(arg().key)).toContain(':win:t2');
  });

  it('a flat close writes nothing at all', async () => {
    // Neither a win nor a loss. Filing it as either would move the win rate.
    const bucket = await brain.recordOutcome({ tradeId: 't3', symbol: 'XAUUSD', pnl: 0 } as never);
    expect(bucket).toBe('flat');
    expect(remember).not.toHaveBeenCalled();
  });

  it('a mistake, as an event', async () => {
    await brain.recordMistake({ symbol: 'BTCUSD', kind: 'execution', detail: 'd', correction: 'c' } as never);
    expect(arg()).toMatchObject({ agent: 'axe_trader', kind: 'event', symbol: 'BTCUSD' });
  });

  it('a lesson keeps its own kind', async () => {
    await brain.recordLesson({ rule: 'r', derivedFrom: ['t1'] });
    expect(arg()).toMatchObject({ kind: 'lesson' });
  });

  it('a lesson with no symbol is filed as ALL, so it applies everywhere', async () => {
    await brain.recordLesson({ rule: 'r', derivedFrom: [] });
    expect(arg().symbol).toBe('ALL');
  });

  it('intel and thesis are facts, not events', async () => {
    await brain.recordIntelSnapshot({ symbol: 'EURUSD', thesis: 't' });
    expect(arg()).toMatchObject({ kind: 'fact' });
    remember.mockClear();
    await brain.recordThesis('EURUSD', 'holding');
    expect(arg()).toMatchObject({ kind: 'fact' });
  });

  it('writes NOTHING to global_memory any more', async () => {
    await brain.recordTrade({ id: 't', symbol: 'E', action: 'buy', confidence: 1 } as never);
    await brain.recordLesson({ rule: 'r', derivedFrom: [] });
    await brain.recordThesis('E', 't');
    expect(saveGlobalMemory).not.toHaveBeenCalled();
  });
});

describe('reads', () => {
  it('asks for its own namespace instead of everyone\'s newest rows', async () => {
    await brain.readNamespace('cycle');
    expect(recall).toHaveBeenCalledWith('axe_trader', expect.anything());
  });

  it('keeps ALL-scoped entries when filtering by symbol', async () => {
    recall.mockResolvedValueOnce([
      { key: 'ta:axe_trading_agent:lesson:1', symbol: 'ALL', content: '{"rule":"everywhere"}' },
      { key: 'ta:axe_trading_agent:lesson:2', symbol: 'EURUSD', content: '{"rule":"eur"}' },
      { key: 'ta:axe_trading_agent:lesson:3', symbol: 'XAUUSD', content: '{"rule":"gold"}' },
    ] as never);
    const out = await brain.readNamespace<{ rule: string }>('lesson', { symbol: 'EURUSD' });
    expect(out.map(o => o.rule).sort()).toEqual(['eur', 'everywhere']);
  });

  it('ignores rows from another namespace', async () => {
    recall.mockResolvedValueOnce([
      { key: 'ta:axe_trading_agent:win:1', symbol: null, content: '{"a":1}' },
      { key: 'ta:axe_trading_agent:loss:1', symbol: null, content: '{"a":2}' },
    ] as never);
    expect(await brain.readNamespace('win')).toHaveLength(1);
  });

  it('survives a row whose content is not JSON', async () => {
    recall.mockResolvedValueOnce([
      { key: 'ta:axe_trading_agent:win:1', symbol: null, content: 'not json' },
      { key: 'ta:axe_trading_agent:win:2', symbol: null, content: '{"a":1}' },
    ] as never);
    expect(await brain.readNamespace('win')).toHaveLength(1);
  });
});
