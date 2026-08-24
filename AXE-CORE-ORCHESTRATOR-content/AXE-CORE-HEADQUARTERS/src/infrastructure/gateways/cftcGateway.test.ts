/**
 * Positioning, and the difference between "flat" and "unknown".
 *
 * COT is weekly and days old by construction. An agent that reads it as a live
 * tape will describe a stale lean as current, so the age travels with it.
 */
import { describe, it, expect } from 'vitest';
import { formatPositioning, type CotPositioning } from './cftcGateway';

const cot = (over: Partial<CotPositioning> = {}): CotPositioning => ({
  pair: 'XAUUSD',
  contract: 'GOLD - COMMODITY EXCHANGE INC.',
  reportDate: '2026-08-18',
  netNonCommercial: 222189,
  longs: 260000,
  shorts: 37811,
  ...over,
});

describe('formatPositioning', () => {
  it('says unknown, not flat, when the instrument has no futures contract', () => {
    // Most FX crosses have none. An agent handed a zero would read the crowd
    // as neutral, which is a claim nobody made.
    const out = formatPositioning(null);
    expect(out).toContain('unknown, not flat');
  });

  it('carries the report date, so a weekly number cannot pass for a live tape', () => {
    expect(formatPositioning(cot())).toContain('2026-08-18');
    expect(formatPositioning(cot())).toContain('days old by design');
  });

  it('names the side rather than leaving a signed number to interpret', () => {
    expect(formatPositioning(cot({ netNonCommercial: 222189 }))).toContain('net LONG');
    expect(formatPositioning(cot({ netNonCommercial: -54573 }))).toContain('net SHORT');
    expect(formatPositioning(cot({ netNonCommercial: 0 }))).toContain('flat');
  });

  it('shows the magnitude unsigned beside the named side', () => {
    const out = formatPositioning(cot({ netNonCommercial: -54573 }));
    expect(out).toContain('net SHORT 54,573');
    expect(out).not.toContain('-54,573');
  });

  it('keeps both legs, because a net of zero on huge books is not a small market', () => {
    const out = formatPositioning(cot());
    expect(out).toContain('260,000 long');
    expect(out).toContain('37,811 short');
  });
});
