import { describe, it, expect } from 'vitest';
import {
  TELEFOON_APPS, TELEFOON_CHIPS, appMetId, appUrl, laadOpenApp, bewaarOpenApp,
  animatieVlaggen, telefoonSchaal, telefoonHoogte, SCHAAL_DOEL, TOPBALK, MARGE_ONDER,
} from './launcher';

function opslag() {
  const m = new Map<string, string>();
  return {
    getItem: (k: string) => m.get(k) ?? null,
    setItem: (k: string, v: string) => { m.set(k, v); },
    removeItem: (k: string) => { m.delete(k); },
  };
}

describe('de apps op de telefoon', () => {
  it('elke id komt één keer voor', () => {
    const ids = TELEFOON_APPS.map((a) => a.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('AXE Mobile en NorthSea staan erop, allebei met een doel', () => {
    expect(appMetId('mobile')?.doel).toBe('/mobile');
    expect(appMetId('northsea')?.doel).toMatch(/^https:\/\/northsea-commodity-partners/);
  });

  it('een route neemt herkomst en zoekparameters mee en zet de route achter de hash', () => {
    const url = appUrl(appMetId('mobile')!, { origin: 'http://localhost:5399', pathname: '/', search: '?ontwerp=1' });
    expect(url).toBe('http://localhost:5399/?ontwerp=1#/mobile');
  });

  it('een url gaat ongewijzigd het frame in', () => {
    const app = appMetId('northsea')!;
    expect(appUrl(app, { origin: 'x', pathname: '/', search: '' })).toBe(app.doel);
  });

  it('een onbekende id is geen app', () => {
    expect(appMetId('bestaat-niet')).toBeNull();
    expect(appMetId(null)).toBeNull();
  });
});

describe('wat de telefoon onthoudt', () => {
  it('onthoudt de open app en vergeet hem bij terug naar het beginscherm', () => {
    const o = opslag();
    bewaarOpenApp(appMetId('chart'), o);
    expect(laadOpenApp(o)?.id).toBe('chart');
    bewaarOpenApp(null, o);
    expect(laadOpenApp(o)).toBeNull();
  });

  it('een bewaarde id die geen app meer is, wordt het beginscherm', () => {
    const o = opslag();
    o.setItem('axe_zwever_telefoon_app', 'weggehaald');
    expect(laadOpenApp(o)).toBeNull();
  });
});

describe('de animatievlaggen', () => {
  it('bewegen standaard', () => {
    expect(animatieVlaggen({ search: '?ontwerp=1', minderBeweging: false })).toEqual({ entree: true, zweef: true });
  });
  it('?anim=0 zet alles stil', () => {
    expect(animatieVlaggen({ search: '?ontwerp=1&anim=0', minderBeweging: false })).toEqual({ entree: false, zweef: false });
  });
  it('prefers-reduced-motion zet alles stil', () => {
    expect(animatieVlaggen({ search: '', minderBeweging: true })).toEqual({ entree: false, zweef: false });
  });
});

describe('de schaal van de telefoon', () => {
  it('is .92 op 1728×1080 — hij zweeft over het chroom, dus dat telt niet mee', () => {
    expect(telefoonSchaal(1080)).toBe(SCHAAL_DOEL);
  });
  it('past op 1440×900 boven de voetmarge', () => {
    const s = telefoonSchaal(900);
    expect(s).toBeLessThanOrEqual(SCHAAL_DOEL);
    expect(s).toBe(0.90);
    expect(TOPBALK + telefoonHoogte(s) + MARGE_ONDER).toBeLessThanOrEqual(900);
  });
  it('krimpt op een laag scherm zodat kop, telefoon en marge onder de topbalk passen', () => {
    const s = telefoonSchaal(700);
    expect(s).toBeLessThan(SCHAAL_DOEL);
    expect(TOPBALK + telefoonHoogte(s) + MARGE_ONDER).toBeLessThanOrEqual(700);
  });
  it('wordt nooit kleiner dan .55', () => {
    expect(telefoonSchaal(200)).toBe(0.55);
  });
});

describe('de tegels', () => {
  it('hebben een icoon en geen letters, en vier staan in het dok', () => {
    for (const a of TELEFOON_APPS) expect(a.icoon.length).toBeGreaterThan(0);
    expect(TELEFOON_APPS.filter((a) => a.dok)).toHaveLength(4);
    expect(TELEFOON_APPS.filter((a) => !a.dok)).toHaveLength(8);
  });
  it('elke chip wijst naar een app die bestaat', () => {
    for (const c of TELEFOON_CHIPS) expect(appMetId(c.appId)).not.toBeNull();
  });
});
