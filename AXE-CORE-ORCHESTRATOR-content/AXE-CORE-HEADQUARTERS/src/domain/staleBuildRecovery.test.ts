import { describe, it, expect } from 'vitest';
import { magHerstelHerladen, meldGoedeLading, HERSTEL_SLEUTEL } from '@/domain/staleBuildRecovery';

function opslag(): Storage {
  const bak = new Map<string, string>();
  return {
    getItem: (k: string) => bak.get(k) ?? null,
    setItem: (k: string, v: string) => { bak.set(k, v); },
    removeItem: (k: string) => { bak.delete(k); },
    clear: () => bak.clear(),
    key: () => null,
    length: 0,
  } as Storage;
}

describe('herstel na een verwisselde build', () => {
  it('mag de eerste keer herladen', () => {
    expect(magHerstelHerladen(opslag())).toBe(true);
  });

  it('mag geen tweede keer -- anders knippert het scherm eindeloos', () => {
    const o = opslag();
    expect(magHerstelHerladen(o)).toBe(true);
    expect(magHerstelHerladen(o)).toBe(false);
  });

  it('mag weer zodra er iets goed geladen is', () => {
    const o = opslag();
    magHerstelHerladen(o);
    meldGoedeLading(o);
    expect(magHerstelHerladen(o)).toBe(true);
  });

  it('herlaadt niet zonder opslag', () => {
    // Privémodus. Geen geheugen betekent geen rem, en een lus is erger dan een
    // crash die je kunt lezen.
    expect(magHerstelHerladen(null)).toBe(false);
    expect(magHerstelHerladen(undefined)).toBe(false);
  });

  it('herlaadt niet als opslag gooit', () => {
    const stuk = { getItem() { throw new Error('denied'); }, setItem() {}, removeItem() {} } as unknown as Storage;
    expect(magHerstelHerladen(stuk)).toBe(false);
  });

  it('meldGoedeLading gooit niet als opslag stuk is', () => {
    const stuk = { removeItem() { throw new Error('denied'); } } as unknown as Storage;
    expect(() => meldGoedeLading(stuk)).not.toThrow();
  });

  it('gebruikt een herkenbare sleutel', () => {
    const o = opslag();
    magHerstelHerladen(o);
    expect(o.getItem(HERSTEL_SLEUTEL)).toBeTruthy();
  });
});
