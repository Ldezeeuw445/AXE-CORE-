/**
 * `127.0.0.1` is niet "de Mac" maar "dit apparaat".
 *
 * Wat hier echt kapot kan: de verpakte Tauri-app als "niet deze machine" lezen
 * (dan verliest Luka zijn vier Mac-shells en zijn lokale agent), en de PWA als
 * "wel deze machine" lezen (dan houdt de telefoon knoppen en verzoeken die niet
 * kunnen slagen).
 */
import { describe, it, expect } from 'vitest';
import { opDezeMachine } from './lokaleMachine';

describe('opDezeMachine', () => {
  it('de verpakte Mac-app: ja', () => {
    // De hostnaam van de verpakte app is `tauri.localhost`, maar het antwoord
    // hangt hier aan de runtime en niet aan die naam.
    expect(opDezeMachine({ tauri: true, paginaHost: 'tauri.localhost' })).toBe(true);
    expect(opDezeMachine({ tauri: true, paginaHost: 'axeheadquarters.com' })).toBe(true);
  });

  it('vite dev en tauri:dev: ja -- de pagina komt van deze machine', () => {
    expect(opDezeMachine({ tauri: false, paginaHost: '127.0.0.1' })).toBe(true);
    expect(opDezeMachine({ tauri: false, paginaHost: 'localhost' })).toBe(true);
    expect(opDezeMachine({ tauri: false, paginaHost: '[::1]' })).toBe(true);
  });

  it('de PWA op de telefoon of de iPad: nee', () => {
    expect(opDezeMachine({ tauri: false, paginaHost: 'axeheadquarters.com' })).toBe(false);
  });

  it('een naam die alleen op localhost LIJKT is het niet', () => {
    // `localhost.axeheadquarters.com` is een gewone domeinnaam.
    expect(opDezeMachine({ tauri: false, paginaHost: 'localhost.axeheadquarters.com' })).toBe(false);
    expect(opDezeMachine({ tauri: false, paginaHost: '' })).toBe(false);
  });
});
