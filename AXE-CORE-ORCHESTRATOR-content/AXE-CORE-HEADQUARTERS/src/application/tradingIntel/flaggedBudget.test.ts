/**
 * The cycle's spend must not scale with the number of accounts.
 *
 * runOnEveryAccount runs the expensive half of a cycle once per account, so a
 * per-account cap multiplies. Measured 2026-08-24: enabling a second and third
 * account turned ten decisions a cycle into thirty, every six minutes, and
 * MetaAPI answered "The quota has been exceeded." The autopilot's own stored
 * result was a row of `No broker price for X (got "synthetic")` — refused
 * lookups, and the engine rightly declining to price a trade off a book that
 * would not fill it.
 */
import { describe, it, expect } from 'vitest';
import { flaggedBudget } from './agentAutopilot';

describe('flaggedBudget', () => {
  it('spends the same on three accounts as on one', () => {
    // The product is what reaches the broker: budget × accounts.
    expect(flaggedBudget(1) * 1).toBeLessThanOrEqual(10);
    expect(flaggedBudget(3) * 3).toBeLessThanOrEqual(10);
  });

  it('divides rather than multiplies as accounts are added', () => {
    expect(flaggedBudget(1)).toBe(10);
    expect(flaggedBudget(2)).toBe(5);
    expect(flaggedBudget(3)).toBe(3);
  });

  it('never drops below two pairs, whatever the account count', () => {
    // One busy account must not reduce a cycle to a single pair — that would
    // make the scan useless long before it made it cheap.
    expect(flaggedBudget(10)).toBe(2);
    expect(flaggedBudget(99)).toBe(2);
  });

  it('treats zero accounts as one rather than dividing by zero', () => {
    expect(flaggedBudget(0)).toBe(10);
  });
});
