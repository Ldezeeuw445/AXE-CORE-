/**
 * Waarom de meldingenknop niet kan, in de volgorde waarin dat nuttig is.
 *
 * Wat hier echt kapot kan: de iPhone een "niet ondersteund" geven terwijl
 * installeren het oplost, of een geweigerde toestemming verzwijgen. Dan staat
 * er een knop die niets doet -- de fout die deze codebase al drie keer maakte.
 */
import { describe, it, expect } from 'vitest';
import { pushStand, type PushOmgeving } from './pushMogelijk';

const o = (over: Partial<PushOmgeving> = {}): PushOmgeving => ({
  serviceWorker: true, pushManager: true, toestemming: 'default',
  tauri: false, iosZonderInstallatie: false, sleutel: true, ...over,
});

describe('pushStand', () => {
  it('kan, als alles er is', () => {
    expect(pushStand(o())).toEqual({ kan: true });
  });

  it('zegt op iOS dat je hem eerst moet installeren -- niet dat het niet kan', () => {
    const s = pushStand(o({ iosZonderInstallatie: true, pushManager: false, toestemming: null }));
    expect(s.kan).toBe(false);
    if (!s.kan) {
      expect(s.herstelbaar).toBe(true);
      expect(s.reden).toMatch(/beginscherm/);
    }
  });

  it('noemt een eerdere weigering, want die kan alleen jij terugdraaien', () => {
    const s = pushStand(o({ toestemming: 'denied' }));
    expect(s.kan).toBe(false);
    if (!s.kan) expect(s.herstelbaar).toBe(true);
  });

  it('zegt in de Mac-app waar meldingen dan wél vandaan komen', () => {
    const s = pushStand(o({ tauri: true, serviceWorker: false }));
    expect(s.kan).toBe(false);
    if (!s.kan) {
      expect(s.herstelbaar).toBe(false);
      expect(s.reden).toMatch(/axeheadquarters\.com/);
    }
  });

  it('en zegt het eerlijk als de bouw geen sleutel heeft', () => {
    const s = pushStand(o({ sleutel: false }));
    expect(s.kan).toBe(false);
    if (!s.kan) expect(s.reden).toMatch(/VITE_VAPID_PUBLIC_KEY/);
  });

  it('zet herstelbare redenen vóór onherstelbare', () => {
    // Een iPhone in Safari heeft geen PushManager én is niet geïnstalleerd.
    // "Deze browser kan het niet" zou dan het laatste woord zijn, terwijl
    // installeren het oplost.
    const s = pushStand(o({ iosZonderInstallatie: true, serviceWorker: false, pushManager: false, toestemming: null, sleutel: false }));
    expect(s.kan).toBe(false);
    if (!s.kan) expect(s.reden).toMatch(/beginscherm/);
  });
});
