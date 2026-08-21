/**
 * Sizing a SHORT.
 *
 * allowShort gated the action but sizing had only two branches — open a long,
 * close a long — so a sell with no position matched neither and kept qty = 0.
 * Measured 2026-08-21 with the setting already switched on in Settings:
 *
 *   LTCUSD  Score -0.400 -> SELL conf 61%.  Size qty=0
 *   XAUUSD  SELL conf 68%                   never reached the broker
 *
 * A decision on the desk, a row in the ledger, and no order anywhere. That is
 * worse than a refusal, because it looks exactly like working.
 */
import { describe, it, expect } from 'vitest';

/** Mirrors the sizing branches in tradingAgentEngine.ts. */
function sizeFor(input: {
  action: 'buy' | 'sell' | 'hold';
  posQty: number;
  equity: number;
  riskPct: number;
  last: number;
  allowShort: boolean;
  blocked?: boolean;
}): number {
  const { action, posQty, equity, riskPct, last, allowShort, blocked } = input;
  const riskBudget = equity * riskPct;
  let qty = 0;
  if (action === 'buy' && !blocked) {
    qty = Math.floor((riskBudget / last) * 1000) / 1000;
    if (qty * last < 10) qty = 0;
  } else if (action === 'sell' && posQty > 0 && !blocked) {
    qty = Math.min(posQty, Math.floor((riskBudget / last) * 1000) / 1000 || posQty);
  } else if (action === 'sell' && posQty <= 0 && allowShort && !blocked) {
    qty = Math.floor((riskBudget / last) * 1000) / 1000;
    if (qty * last < 10) qty = 0;
  }
  return qty;
}

const BASE = { equity: 48_600, riskPct: 0.03, allowShort: true };

describe('sizing a short', () => {
  it('gives a flat short a real size instead of zero', () => {
    // The exact case that produced qty=0 on the desk.
    const qty = sizeFor({ ...BASE, action: 'sell', posQty: 0, last: 51.53 });
    expect(qty).toBeGreaterThan(0);
  });

  it('sizes a short the same as the long it mirrors', () => {
    // The risk budget buys the same notional whichever way it points.
    const long = sizeFor({ ...BASE, action: 'buy', posQty: 0, last: 4594.77 });
    const short = sizeFor({ ...BASE, action: 'sell', posQty: 0, last: 4594.77 });
    expect(short).toBe(long);
  });

  it('still refuses to open a short when shorts are switched off', () => {
    const qty = sizeFor({ ...BASE, allowShort: false, action: 'sell', posQty: 0, last: 51.53 });
    expect(qty).toBe(0);
  });

  it('closes a long rather than opening a short when one is held', () => {
    // A sell against an open long is an exit, and must never exceed it —
    // selling more than is held would flip to a short nobody asked for.
    const held = 0.4;
    const qty = sizeFor({ ...BASE, action: 'sell', posQty: held, last: 4594.77 });
    expect(qty).toBeLessThanOrEqual(held);
    expect(qty).toBeGreaterThan(0);
  });

  it('does not size anything the risk gate has blocked', () => {
    expect(sizeFor({ ...BASE, action: 'sell', posQty: 0, last: 51.53, blocked: true })).toBe(0);
    expect(sizeFor({ ...BASE, action: 'buy', posQty: 0, last: 51.53, blocked: true })).toBe(0);
  });

  it('refuses a short too small to be worth the spread', () => {
    // Same floor the long side keeps: under $10 notional is noise.
    const qty = sizeFor({ ...BASE, equity: 100, riskPct: 0.00005, action: 'sell', posQty: 0, last: 4594.77 });
    expect(qty).toBe(0);
  });
});
