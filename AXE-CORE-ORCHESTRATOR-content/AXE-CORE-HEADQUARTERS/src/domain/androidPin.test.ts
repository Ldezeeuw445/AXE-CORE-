import { describe, it, expect } from 'vitest';
import {
  PIN_LENGTE, pinIsGezet, isOntgrendeld, ontgrendel, vergrendel,
  zetPin, pinKlopt, wisPin, androidSlotLaatDoor, verifieerCode, MINIMUM_LENGTE,
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

const CODE = ['swipeRight', 'triangle', '1', 'check'];

describe('android particle-gesture PIN', () => {
  it('vier gebaren is de standaardlengte, minstens drie', () => {
    expect(PIN_LENGTE).toBe(4);
    expect(MINIMUM_LENGTE).toBe(3);
  });

  it('zet en herkent een gebarenreeks, slaat namen niet in klare tekst op', async () => {
    const opslag = geheugen();
    expect(pinIsGezet(opslag)).toBe(false);
    const r = await zetPin(CODE, opslag);
    expect(r.ok).toBe(true);
    expect(pinIsGezet(opslag)).toBe(true);
    const raw = opslag.getItem('axe_particle_gesture_lock') ?? '';
    expect(raw).not.toContain('swipeRight');
    expect(raw).not.toContain('triangle');
    expect(await pinKlopt(CODE, opslag)).toBe(true);
    expect(await pinKlopt(['swipeLeft', 'triangle', '1', 'check'], opslag)).toBe(false);
  });

  it('wijst te korte codes af', async () => {
    const opslag = geheugen();
    const r = await zetPin(['v', 'caret'], opslag);
    expect(r.ok).toBe(false);
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
    await zetPin(CODE, opslag);
    ontgrendel(sessie);
    wisPin(opslag, sessie);
    expect(pinIsGezet(opslag)).toBe(false);
    expect(isOntgrendeld(sessie)).toBe(false);
  });

  it('meldt lock-out na vijf foute pogingen', async () => {
    const opslag = geheugen();
    await zetPin(CODE, opslag);
    const fout = ['square', 'square', 'square', 'square'];
    for (let i = 0; i < 5; i++) {
      const r = await verifieerCode(fout, opslag);
      expect(r.ok).toBe(false);
    }
    const locked = await verifieerCode(CODE, opslag);
    expect(locked.ok).toBe(false);
    expect(locked.ok === false && locked.fout.includes('Too many')).toBe(true);
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
