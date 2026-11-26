import { describe, expect, it } from 'vitest';
import { geldigePin, leesPinRecord, maakPinRecord, nogOpen, pinKlopt } from './geldPin';

describe('Geld achter een PIN', () => {
  it('alleen 4 tot 8 cijfers', () => {
    expect(geldigePin('1234')).toBe(true);
    expect(geldigePin('12345678')).toBe(true);
    expect(geldigePin('123')).toBe(false);
    expect(geldigePin('12a4')).toBe(false);
  });

  it('hash klopt alleen voor de juiste PIN, en zout verschilt', async () => {
    const r = await maakPinRecord('4821', 1000);
    expect(r.hash).not.toContain('4821');
    expect(await pinKlopt('4821', r)).toBe(true);
    expect(await pinKlopt('4822', r)).toBe(false);
    const r2 = await maakPinRecord('4821', 1000);
    expect(r2.zout).not.toBe(r.zout);
    expect(leesPinRecord(JSON.stringify(r))).toEqual(r);
    expect(leesPinRecord('kapot')).toBeNull();
    await expect(maakPinRecord('12')).rejects.toThrow();
  });

  it('open tot een tijd', () => {
    expect(nogOpen(null, 5)).toBe(false);
    expect(nogOpen(10, 5)).toBe(true);
    expect(nogOpen(10, 10)).toBe(false);
  });
});
