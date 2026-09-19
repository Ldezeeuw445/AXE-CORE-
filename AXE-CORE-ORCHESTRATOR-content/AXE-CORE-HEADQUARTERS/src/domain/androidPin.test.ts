import { describe, it, expect } from 'vitest';
import {
  PIN_LENGTE, pinCijfersGeldig, pinIsGezet, isOntgrendeld, ontgrendel, vergrendel,
  zetPin, pinKlopt, wisPin, androidSlotLaatDoor,
} from './androidPin';

function geheugen(): Storage {
  const m = new Map<string, string>();
  return {
    get length() { return m.size; },
    clear() { m.clear(); },
    getItem(k) { return m.has(k) ? m.get(k)! : null; },
    setItem(k, v) { m.set(k, String(v)); },
    removeItem(k) { m.delete(k); },
    key(i) { return [...m.keys()][i] ?? null; },
  };
}

describe('android PIN', () => {
  it('aanvaardt alleen vier cijfers', () => {
    expect(pinCijfersGeldig('1234')).toBe(true);
    expect(pinCijfersGeldig('12')).toBe(false);
    expect(pinCijfersGeldig('12345')).toBe(false);
    expect(pinCijfersGeldig('12ab')).toBe(false);
    expect(PIN_LENGTE).toBe(4);
  });

  it('zet en herkent een PIN, slaat hem niet in klare tekst op', async () => {
    const opslag = geheugen();
    expect(pinIsGezet(opslag)).toBe(false);
    const r = await zetPin('2580', opslag);
    expect(r.ok).toBe(true);
    expect(pinIsGezet(opslag)).toBe(true);
    expect(opslag.getItem('axe_android_pin_hash')).not.toBe('2580');
    expect(opslag.getItem('axe_android_pin_hash') ?? '').not.toContain('2580');
    expect(await pinKlopt('2580', opslag)).toBe(true);
    expect(await pinKlopt('0000', opslag)).toBe(false);
  });

  it('ontgrendelen is sessie, geen permanente vlag', () => {
    const sessie = geheugen();
    expect(isOntgrendeld(sessie)).toBe(false);
    ontgrendel(sessie);
    expect(isOntgrendeld(sessie)).toBe(true);
    vergrendel(sessie);
    expect(isOntgrendeld(sessie)).toBe(false);
  });

  it('wisPin haalt hash én ontgrendeling weg', async () => {
    const opslag = geheugen();
    const sessie = geheugen();
    await zetPin('1111', opslag);
    ontgrendel(sessie);
    wisPin(opslag, sessie);
    expect(pinIsGezet(opslag)).toBe(false);
    expect(isOntgrendeld(sessie)).toBe(false);
  });

  it('op slot alleen lock, pin en login door', () => {
    expect(androidSlotLaatDoor('/lock')).toBe(true);
    expect(androidSlotLaatDoor('/lock/pin')).toBe(true);
    expect(androidSlotLaatDoor('/login')).toBe(true);
    expect(androidSlotLaatDoor('/devices')).toBe(false);
    expect(androidSlotLaatDoor('/maps-3d')).toBe(false);
    expect(androidSlotLaatDoor('/')).toBe(false);
  });
});
