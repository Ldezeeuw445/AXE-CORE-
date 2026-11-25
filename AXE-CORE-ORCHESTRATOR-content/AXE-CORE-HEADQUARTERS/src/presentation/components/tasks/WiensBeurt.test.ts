import { describe, expect, it } from 'vitest';
import { zelfReden } from './WiensBeurt';

describe('Do it for me', () => {
  it('toont de reden van de VPS zonder het API-voorvoegsel', () => {
    expect(zelfReden(new Error('AXE API 409: Money, trading, approvals or deleting stay with you.')))
      .toBe('Money, trading, approvals or deleting stay with you.');
  });
  it('valt terug op een eerlijke zin', () => {
    expect(zelfReden(new Error(''))).toBe('AXE could not take this over.');
  });
});
