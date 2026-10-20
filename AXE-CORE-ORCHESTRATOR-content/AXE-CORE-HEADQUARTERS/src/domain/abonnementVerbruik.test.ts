import { describe, expect, it } from 'vitest';
import { resetTekst, verbruikBalken, verbruikMelding, verbruikStand, type AbonnementVerbruik } from './abonnementVerbruik';

const NU = Date.parse('2026-10-11T19:00:00Z');
const claude4: AbonnementVerbruik = {
  motor: 'claude4', label: 'Claude · lukadezeeuw4@gmail.com', account: 'lukadezeeuw4@gmail.com', status: 'ok', plan: 'pro',
  sessie: { procent: 36, reset: '2026-10-11T23:49:59Z' },
  week: { procent: 5, reset: '2026-10-12T01:59:59Z' },
};

describe('abonnementVerbruik', () => {
  it('een gemeten account is online, met sessie- en weekbalk zoals de aanbieder', () => {
    expect(verbruikStand(claude4)).toEqual({ toon: 'ok', tekst: 'Online' });
    const b = verbruikBalken(claude4, NU);
    expect(b.map(x => x.label)).toEqual(['Session (5h)', 'Week']);
    expect(b[0].waarde).toBe('36% used · resets in 4h 50m');
    expect(b[0].pct).toBe(36);
  });

  it('vol of bijna vol zegt dat, niet "Online"', () => {
    expect(verbruikStand({ ...claude4, sessie: { procent: 85, reset: null } }).tekst).toBe('Almost full');
    expect(verbruikStand({ ...claude4, week: { procent: 100, reset: null } }).tekst).toBe('Limit reached');
  });

  it('verlopen of geblokkeerd: geen balken, wel de reden en wat te doen', () => {
    const verlopen: AbonnementVerbruik = { ...claude4, status: 'expired', reden: 'Token expired.', login: 'claude auth login', sessie: undefined };
    expect(verbruikStand(verlopen).tekst).toBe('Login expired');
    expect(verbruikBalken(verlopen)).toEqual([]);
    expect(verbruikMelding(verlopen)).toBe('Token expired. Log in: claude auth login');
    expect(verbruikStand({ ...claude4, status: 'blocked' }).toon).toBe('bad');
    // Ingelogd, alleen het korte token verlopen: geen waarschuwing meer.
    const stil: AbonnementVerbruik = { ...claude4, status: 'idle', reden: 'Idle. Checked in 3h ago; the session renews on the next run.', sessie: undefined };
    expect(verbruikStand(stil)).toEqual({ toon: 'info', tekst: 'Idle' });
    expect(verbruikMelding(stil)).toBeUndefined();
    expect(verbruikBalken(stil)).toEqual([]);
  });

  it('nog niets gemeten is "Checking", geen rood', () => {
    expect(verbruikStand(undefined)).toEqual({ toon: 'muted', tekst: 'Checking' });
  });

  it('resettijd in dagen voor de week, leeg als voorbij', () => {
    expect(resetTekst('2026-10-14T03:00:00Z', NU)).toBe('resets in 2d 8h');
    expect(resetTekst('2026-10-11T18:00:00Z', NU)).toBe('');
  });
});
