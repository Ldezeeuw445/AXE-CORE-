import { describe, expect, it } from 'vitest';
import {
  EIGEN_APPS,
  eigenApp,
  monitorIndexVoor,
  plekUit,
  shellOpdracht,
  shellRechthoek,
  toestelVoor,
  vindEigenApp,
} from './eigenApps';

describe('vindEigenApp', () => {
  it('kent de vijf apps uit Luka\'s vraag', () => {
    expect(vindEigenApp('open trading os op dit scherm')?.id).toBe('trading-os');
    expect(vindEigenApp('Open AXON Memory op me andere scherm')?.id).toBe('axon');
    expect(vindEigenApp('open northsea desk op me imac')?.id).toBe('northsea');
    expect(vindEigenApp('zet de companion neer als ipad')?.id).toBe('companion');
    expect(vindEigenApp('open AXE Developer')?.id).toBe('developer');
    expect(vindEigenApp('open het weer')).toBeNull();
  });

  it('elke app heeft een pagina of een url, nooit geen van beide', () => {
    for (const app of EIGEN_APPS) expect(Boolean(app.pagina) !== Boolean(app.url)).toBe(true);
  });
});

describe('plekUit', () => {
  it('leest scherm, toestel en formaat uit een gewone zin', () => {
    expect(plekUit('open trading os op dit scherm')).toEqual({ scherm: 'dit', toestel: 'hier' });
    expect(plekUit('axon op me andere scherm')).toEqual({ scherm: 'ander', toestel: 'hier' });
    expect(plekUit('northsea desk op me iMac')).toEqual({ scherm: 'dit', toestel: 'imac' });
    expect(plekUit('companion op de mac mini als ipad, scherm 2')).toEqual({ scherm: 1, toestel: 'macmini', vorm: 'tablet' });
    expect(plekUit('open companion on my second screen as a phone')).toEqual({ scherm: 'ander', toestel: 'hier', vorm: 'telefoon' });
  });
});

describe('monitorIndexVoor', () => {
  it('"ander" is een ander scherm dan waar je nu zit, en met één scherm gewoon dit', () => {
    expect(monitorIndexVoor('ander', 0, 2)).toBe(1);
    expect(monitorIndexVoor('ander', 1, 2)).toBe(0);
    expect(monitorIndexVoor('ander', 0, 1)).toBe(0);
    expect(monitorIndexVoor('dit', 1, 2)).toBe(1);
    expect(monitorIndexVoor(5, 0, 2)).toBe(1);
  });
});

describe('shellRechthoek', () => {
  it('een telefoon op ware grootte, midden op het tweede scherm, nooit opgeblazen', () => {
    const r = shellRechthoek('telefoon', { x: 1920, y: 0, breedte: 1920, hoogte: 1080 });
    expect(r).toEqual({ x: 1920 + (1920 - 430) / 2, y: (1080 - 932) / 2, breedte: 430, hoogte: 932 });
  });

  it('een iPad op een laag scherm schaalt mee in plaats van te pletten', () => {
    const r = shellRechthoek('tablet', { x: 0, y: 0, breedte: 1440, hoogte: 900 });
    expect(r.hoogte).toBe(828);
    expect(r.breedte / r.hoogte).toBeCloseTo(834 / 1194, 2);
  });

  it('bureaublad vult tot 1440x920 linksboven met marge', () => {
    expect(shellRechthoek('bureaublad', { x: 0, y: 0, breedte: 2560, hoogte: 1440 })).toEqual({ x: 36, y: 36, breedte: 1440, hoogte: 920 });
  });
});

describe('toestelVoor', () => {
  const nu = Date.parse('2026-10-29T13:00:00Z');
  const rij = (id: string, naam: string, s = 10) => ({
    device_id: id, device_name: naam, platform: 'macos', last_seen: new Date(nu - s * 1000).toISOString(),
  });

  it('vindt de iMac en de Mac mini op naam', () => {
    const rijen = [rij('main-imac-luka', 'main-imac-luka'), rij('lukas-mac-mini', 'Lukas-Mac-mini')];
    expect(toestelVoor('imac', rijen, nu)?.device_id).toBe('main-imac-luka');
    expect(toestelVoor('macmini', rijen, nu)?.device_id).toBe('lukas-mac-mini');
  });

  it('met één herkende iMac is de andere Mac de mini, en een oude rij telt niet', () => {
    const rijen = [rij('main-imac-luka', 'main-imac-luka'), rij('app-48aec205', 'Mac'), rij('app-dood', 'Mac', 900)];
    expect(toestelVoor('macmini', rijen, nu)?.device_id).toBe('app-48aec205');
    expect(toestelVoor('imac', [rij('app-1', 'Mac'), rij('app-2', 'Mac')], nu)).toBeNull();
  });
});

describe('shellOpdracht', () => {
  it('is pending (de VPS claimt alleen queued) en noemt het doeltoestel', () => {
    const rij = shellOpdracht(eigenApp('northsea')!, { scherm: 'ander', toestel: 'imac' },
      { device_id: 'main-imac-luka', device_name: 'main-imac-luka', platform: 'macos', last_seen: null }, 'u-1');
    expect(rij.status).toBe('pending');
    expect(rij.capability).toBe('axe_shell');
    expect(rij.target_device).toBe('main-imac-luka');
    expect(rij.payload).toEqual({ app: 'northsea', scherm: 'ander', vorm: null });
  });
});
