/**
 * A return code is not an order id, and HTTP 200 is not a fill.
 *
 * Measured 2026-08-25 on the live desk, in one status line:
 *
 *   OANDA DEMO 50K: SELL NAS100 conf=61% · fill 29718dff-…   (real)
 *   MT5 100K DEMO:  SELL NAS100 conf=61% · fill -12          (never happened)
 *   FTMO 100K DEMO: SELL NAS100 conf=61% · fill 527028940    (real)
 *
 * MT5 had zero open positions then and has never had one. -12 is the
 * terminal's rejection code, printed as the id of the trade it refused,
 * because the reader fell back to `numericCode` and trusted the 200.
 */
import { describe, it, expect } from 'vitest';
import { readTradeResult } from './metaApiService';

describe('readTradeResult', () => {
  it('accepts a real order id', () => {
    const r = readTradeResult({ orderId: '527028940', stringCode: 'TRADE_RETCODE_DONE' });
    expect(r).toMatchObject({ ok: true, orderId: '527028940' });
  });

  it('accepts the terminal saying done without an id', () => {
    // Some brokers answer DONE and report the ticket only on the next poll.
    expect(readTradeResult({ stringCode: 'TRADE_RETCODE_DONE' })).toMatchObject({ ok: true });
    expect(readTradeResult({ stringCode: 'ERR_NO_ERROR' })).toMatchObject({ ok: true });
    expect(readTradeResult({ stringCode: 'TRADE_RETCODE_PLACED' })).toMatchObject({ ok: true });
  });

  it('refuses the rejection that was reported as a fill', () => {
    // The exact shape behind "fill -12".
    const r = readTradeResult({ numericCode: -12, stringCode: 'TRADE_RETCODE_INVALID' });
    expect(r.ok).toBe(false);
    expect((r as { error: string }).error).toContain('TRADE_RETCODE_INVALID');
  });

  it('never turns a numeric return code into an order id', () => {
    const r = readTradeResult({ numericCode: 10009 });
    // No stringCode, no id: this is not evidence of a fill, whatever the number.
    expect(r.ok).toBe(false);
    expect((r as { error: string }).error).toContain('10009');
  });

  it('carries the broker message so the reason is not lost', () => {
    const r = readTradeResult({ numericCode: 10019, stringCode: 'TRADE_RETCODE_NO_MONEY', message: 'Not enough money' });
    expect((r as { error: string }).error).toContain('TRADE_RETCODE_NO_MONEY');
    expect((r as { error: string }).error).toContain('Not enough money');
  });

  it('treats an empty or missing body as a refusal, not a fill', () => {
    expect(readTradeResult({}).ok).toBe(false);
    expect(readTradeResult(null).ok).toBe(false);
    expect(readTradeResult({ orderId: '' }).ok).toBe(false);
  });
});
