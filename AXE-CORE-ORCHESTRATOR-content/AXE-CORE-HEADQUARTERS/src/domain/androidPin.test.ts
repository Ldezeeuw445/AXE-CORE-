import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  PIN_LENGTE, pinIsGezet, isOntgrendeld, ontgrendel, vergrendel,
  zetPin, pinKlopt, wisPin, androidSlotLaatDoor, androidPinPad, verifieerCode, MINIMUM_LENGTE,
  RECORD_SLEUTEL, bewaarTerugPad, naOntgrendelenPad, SCHIL_START,
  zetCijferPin, verifieerCijfers, telefoonPinNodig, leesPinSoort, isCijferReeks,
  OPSLAG_DICHT,
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

  it('cijfer-pad is alleen /lock/pin en login, niet de glance', () => {
    expect(androidPinPad('/lock/pin')).toBe(true);
    expect(androidPinPad('/login')).toBe(true);
    expect(androidPinPad('/lock')).toBe(false);
    expect(androidPinPad('/mobile')).toBe(false);
  });

  it('cijfer-PIN is nodig, gebaar-restant niet, lege opslag niet', async () => {
    const opslag = geheugen();
    expect(isCijferReeks(['1', '4', '7', '2'])).toBe(true);
    expect(isCijferReeks(CODE)).toBe(false);
    expect(await telefoonPinNodig(opslag)).toBe(false);
    await zetPin(CODE, opslag);
    expect(leesPinSoort(opslag)).toBe('gesture');
    expect(await telefoonPinNodig(opslag)).toBe(false);
    const r = await zetCijferPin('1472', opslag);
    expect(r.ok).toBe(true);
    expect(leesPinSoort(opslag)).toBe('numeric');
    expect(await telefoonPinNodig(opslag)).toBe(true);
    expect((await verifieerCijfers('1472', opslag)).ok).toBe(true);
    expect((await verifieerCijfers('0000', opslag)).ok).toBe(false);
  });

  it('opslagfout is geen PIN: nooit een doodlopend slot', async () => {
    const kapot: Storage = {
      get length() { return 0; },
      clear() {},
      getItem() { throw new Error(OPSLAG_DICHT); },
      setItem() { throw new Error(OPSLAG_DICHT); },
      removeItem() { throw new Error(OPSLAG_DICHT); },
      key() { return null; },
    };
    await expect(telefoonPinNodig(kapot)).resolves.toBe(false);
  });

  it('na ontgrendelen terug naar de schil, niet Device Manager', () => {
    const sessie = geheugen();
    expect(naOntgrendelenPad(sessie)).toBe(SCHIL_START);
    expect(SCHIL_START).toBe('/mobile');
    bewaarTerugPad('/lock', sessie);
    bewaarTerugPad('/lock/pin', sessie);
    bewaarTerugPad('/login', sessie);
    expect(naOntgrendelenPad(sessie)).toBe('/mobile');
    bewaarTerugPad('/', sessie);
    expect(naOntgrendelenPad(sessie)).toBe('/mobile');
    bewaarTerugPad('/tasks', sessie);
    expect(naOntgrendelenPad(sessie)).toBe('/tasks');
    bewaarTerugPad('/lock', sessie);
    expect(naOntgrendelenPad(sessie)).toBe('/tasks');
  });
});

describe('WebView valt terug op localStorage', () => {
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
    vi.stubGlobal('window', {});
    vi.stubGlobal('navigator', { userAgent: 'Mozilla/5.0 (Linux; Android 15)' });
    vi.stubGlobal('localStorage', web);
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('zetPin zonder KeyStore schrijft het PBKDF2-record naar localStorage', async () => {
    const r = await zetPin(CODE);
    expect(r.ok).toBe(true);
    const raw = web.getItem(RECORD_SLEUTEL) ?? '';
    expect(raw.length).toBeGreaterThan(0);
    expect(raw).not.toContain('swipeRight');
    expect(await pinIsGezet()).toBe(true);
    expect(await pinKlopt(CODE)).toBe(true);
  });

  it('pinIsGezet is false als er nog geen code staat, geen rode fout', async () => {
    await expect(pinIsGezet()).resolves.toBe(false);
    expect(web.getItem(RECORD_SLEUTEL)).toBeNull();
  });

  it('negeert een oude ongeldige plaintext-record en zet een nieuwe', async () => {
    web.setItem(RECORD_SLEUTEL, JSON.stringify({ hash: 'lek', salt: 'x', length: 4 }));
    expect(await pinIsGezet()).toBe(false);
    const r = await zetPin(CODE);
    expect(r.ok).toBe(true);
    expect(web.getItem(RECORD_SLEUTEL)).not.toContain('lek');
  });
});
