/**
 * Intel has a shelf life.
 *
 * The engine took the newest report with status 'complete' and never read its
 * date. Measured 2026-08-21: nothing had completed in three days — the research
 * team had been dark since the primary provider slot started failing — and the
 * newest completed report in the entire store was from 18 August, with most
 * dated the 11th. Every XAUUSD decision on the desk still read "Intel SELL 61%"
 * and scored against a thesis written ten days earlier.
 *
 * That is worse than having no intel. The agent weights it, the confidence it
 * produces looks earned, and nothing on the desk distinguishes it from a fresh
 * read of the market.
 */
import { describe, it, expect } from 'vitest';
import { isUsableIntel } from './tradingAgentEngine';

const hoursAgo = (h: number) => new Date(Date.now() - h * 60 * 60_000).toISOString();

describe('isUsableIntel', () => {
  it('accepts a report written this cycle', () => {
    expect(isUsableIntel({ status: 'complete', createdAt: hoursAgo(0.2) })).toBe(true);
  });

  it('survives a provider outage of a few cycles', () => {
    // The window has to be wider than a blip, or one failed provider silently
    // drops the whole desk to tape-only.
    expect(isUsableIntel({ status: 'complete', createdAt: hoursAgo(6) })).toBe(true);
  });

  it('refuses the ten-day-old thesis that was being traded as intel', () => {
    expect(isUsableIntel({ status: 'complete', createdAt: hoursAgo(24 * 10) })).toBe(false);
  });

  it('refuses a report that is merely old, not ancient', () => {
    expect(isUsableIntel({ status: 'complete', createdAt: hoursAgo(24) })).toBe(false);
  });

  it('never uses a run that has not finished', () => {
    // XAUUSD sat in 'running' all day on 2026-08-21; a half-written thesis is
    // not a view.
    expect(isUsableIntel({ status: 'running', createdAt: hoursAgo(0.1) })).toBe(false);
  });

  it('treats an unreadable timestamp as too old, not as fresh', () => {
    // The safe reading of "unknown age" is "too old" — the alternative trusts
    // exactly the thing that cannot be checked.
    expect(isUsableIntel({ status: 'complete', createdAt: undefined })).toBe(false);
    expect(isUsableIntel({ status: 'complete', createdAt: 'gisteren' })).toBe(false);
  });
});
