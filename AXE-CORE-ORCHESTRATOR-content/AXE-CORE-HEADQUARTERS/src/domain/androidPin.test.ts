import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  PIN_LENGTE, pinIsGezet, isOntgrendeld, ontgrendel, vergrendel,
  zetPin, pinKlopt, wisPin, androidSlotLaatDoor, verifieerCode, MINIMUM_LENGTE,
  RECORD_SLEUTEL, OPSLAG_DICHT,
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
    expect(await pinIsGezet(opslag)).toBe(false);
    const r = await zetPin(CODE, opslag);
    expect(r.ok).toBe(true);
    expect(await pinIsGezet(opslag)).toBe(true);
    const raw = opslag.getItem(RECORD_SLEUTEL) ?? '';
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
    await wisPin(opslag, sessie);
    expect(await pinIsGezet(opslag)).toBe(false);
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

describe('geen localStorage-fallback', () => {
  const bak = new Map<string, string>();
  const web: Storage = {
    get length() { return bak.size; },
    clear() { bak.clear(); },
    getItem(k) { return bak.has(k) ? bak.get(k)! : null; },
    setItem(k, v) { bak.set(k, String(v)); },
    removeItem(k) { bak.delete(k); },
    key(i) { return [...bak.keys()][i] ?? null; },
  };

  beforeEach(() => {
    bak.clear();
    vi.stubGlobal('localStorage', web);
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('zetPin zonder native brug schrijft het record niet naar localStorage', async () => {
    const r = await zetPin(CODE);
    expect(r.ok).toBe(false);
    expect(r.fout).toBe(OPSLAG_DICHT);
    expect(web.getItem(RECORD_SLEUTEL)).toBeNull();
    expect(JSON.stringify([...bak.entries()])).not.toContain('swipeRight');
  });

  it('pinIsGezet gooit als KeyStore ontbreekt in plaats van "niet gezet"', async () => {
    await expect(pinIsGezet()).rejects.toThrow(OPSLAG_DICHT);
    expect(web.getItem(RECORD_SLEUTEL)).toBeNull();
  });

  it('veegt een oude plaintext-record uit localStorage bij native-poging', async () => {
    web.setItem(RECORD_SLEUTEL, JSON.stringify({ hash: 'lek', salt: 'x', length: 4 }));
    const r = await zetPin(CODE);
    expect(r.ok).toBe(false);
    expect(web.getItem(RECORD_SLEUTEL)).toBeNull();
  });
});
