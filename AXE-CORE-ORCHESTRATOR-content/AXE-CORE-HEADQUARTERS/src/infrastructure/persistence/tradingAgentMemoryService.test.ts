/**
 * The one property this service has to hold: what the trader writes is what the
 * trader can read back.
 *
 * It did not hold for four days. The read moved to the `axe_trader` namespace
 * and the write stayed on global_memory, so both calls succeeded, neither
 * errored, and the agent recalled a world frozen on 23 August. A test that only
 * checked "does the write resolve" would have passed throughout — so these
 * assert the DESTINATION, not the absence of an exception.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// The mocks declare the argument they are called with. Written as
// `vi.fn(async () => …)` they take none, so `mock.calls[0][0]` is a type
// error on an empty tuple -- while the test does pass an argument and the
// assertions do read it. Naming it changes nothing at runtime and makes
// the test say what it actually does.
const remember = vi.fn(async (_entry: Record<string, unknown>) => true);
const recall = vi.fn(async (_query: unknown) => [] as unknown[]);
const saveGlobalMemory = vi.fn(async (_entry: Record<string, unknown>) => {});

vi.mock('@/infrastructure/persistence/agentMemoryService', () => ({ remember, recall }));
vi.mock('@/infrastructure/persistence/globalMemoryService', () => ({ saveGlobalMemory }));
vi.mock('@/infrastructure/persistence/chatPersistence', () => ({ AXE_USER_ID: 'u-axe-core' }));

const {
  rememberLesson, rememberOpenThesis, rememberTradeDecision, loadTradingAgentMemory,
} = await import('./tradingAgentMemoryService');

beforeEach(() => { remember.mockClear(); recall.mockClear(); saveGlobalMemory.mockClear(); });

describe('the trader writes where it reads', () => {
  it('sends a lesson to its own namespace', async () => {
    await rememberLesson('EURUSD', 'stopped out on the retest', 0.8);
    expect(remember).toHaveBeenCalledTimes(1);
    expect(remember.mock.calls[0][0]).toMatchObject({
      agent: 'axe_trader', kind: 'lesson', symbol: 'EURUSD',
      content: 'stopped out on the retest', confidence: 0.8,
    });
  });

  it('sends a thesis to its own namespace, upper-cased and stably keyed', async () => {
    await rememberOpenThesis('gbpusd', 'range until the print');
    const arg = remember.mock.calls[0][0];
    expect(arg).toMatchObject({ agent: 'axe_trader', kind: 'fact', symbol: 'GBPUSD' });
    // Stable key: a new thesis replaces the old one instead of stacking.
    expect(arg.key).toBe('ta:axe_trading_agent:thesis:GBPUSD');
  });

  it('sends a decision to its own namespace', async () => {
    await rememberTradeDecision({
      id: 'd1', symbol: 'XAUUSD', action: 'buy', confidence: 0.7,
      createdAt: '2026-08-27T00:00:00Z', rationale: 'r',
    } as never);
    expect(remember.mock.calls[0][0]).toMatchObject({ agent: 'axe_trader', kind: 'event', symbol: 'XAUUSD' });
  });

  it('writes NOTHING to global_memory — the drawer it stopped opening', async () => {
    await rememberLesson('EURUSD', 'a');
    await rememberOpenThesis('EURUSD', 'b');
    await rememberTradeDecision({
      id: 'd', symbol: 'EURUSD', action: 'sell', confidence: 0.5,
      createdAt: '2026-08-27T00:00:00Z', rationale: 'r',
    } as never);
    expect(saveGlobalMemory).not.toHaveBeenCalled();
  });

  it('reads back from the same namespace it wrote to', async () => {
    await loadTradingAgentMemory(10);
    expect(recall).toHaveBeenCalledWith('axe_trader', expect.anything());
    // The destination of every write matches the source of the read. This is
    // the assertion that would have failed on 23 August.
    await rememberLesson('EURUSD', 'x');
    expect(remember.mock.calls[0][0].agent).toBe(recall.mock.calls[0][0]);
  });
});
