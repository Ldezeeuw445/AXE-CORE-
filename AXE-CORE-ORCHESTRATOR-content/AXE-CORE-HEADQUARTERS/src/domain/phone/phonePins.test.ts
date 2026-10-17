import { describe, expect, it } from 'vitest';
import {
  DEFAULT_PHONE_PINS, MORE_PIN, PHONE_PIN_MAX, balkTabs, parsePhonePins,
  pinNaarBalk, unpinVanBalk, phoneZonderComposer, pinIsActief, HOME_PIN,
} from './phonePins';

describe('phonePins', () => {
  it('standaard Home Trading AXE Memory, max 4 + More', () => {
    expect(DEFAULT_PHONE_PINS.map((p) => p.label)).toEqual(['Home', 'Trading', 'AXE', 'Memory']);
    expect(balkTabs([...DEFAULT_PHONE_PINS]).map((p) => p.label)).toEqual(['Home', 'Trading', 'AXE', 'Memory', 'More']);
    expect(PHONE_PIN_MAX).toBe(4);
    expect(MORE_PIN.path).toBe('/apps');
  });

  it('lege opslag is de default, rotzooi ook', () => {
    expect(parsePhonePins(null)[0]).toEqual(HOME_PIN);
    expect(parsePhonePins('nee')[0].id).toBe('home');
  });

  it('pin vervangt het laatste slot, Home blijft', () => {
    const vol = [...DEFAULT_PHONE_PINS];
    const next = pinNaarBalk(vol, '/maps-3d');
    expect(next[0].path).toBe('/mobile');
    expect(next.some((p) => p.path === '/maps-3d')).toBe(true);
    expect(next.length).toBeLessThanOrEqual(PHONE_PIN_MAX);
    expect(next.some((p) => p.path === '/memory')).toBe(false);
  });

  it('unpin haalt Trading weg maar niet Home', () => {
    const next = unpinVanBalk([...DEFAULT_PHONE_PINS], '/trading');
    expect(next.some((p) => p.path === '/trading')).toBe(false);
    expect(unpinVanBalk(next, '/mobile')[0].path).toBe('/mobile');
  });

  it('composer ontbreekt alleen op AXON, Companion en Developer', () => {
    expect(phoneZonderComposer('/memory')).toBe(true);
    expect(phoneZonderComposer('/memory/trading')).toBe(true);
    expect(phoneZonderComposer('/companion')).toBe(true);
    expect(phoneZonderComposer('/code-editor')).toBe(true);
    expect(phoneZonderComposer('/trading')).toBe(false);
    expect(phoneZonderComposer('/browser')).toBe(false);
    expect(phoneZonderComposer('/mobile')).toBe(false);
  });

  it('More is actief buiten de pins', () => {
    expect(pinIsActief('/apps', MORE_PIN)).toBe(true);
    expect(pinIsActief('/agents', MORE_PIN)).toBe(true);
    expect(pinIsActief('/mobile', MORE_PIN)).toBe(false);
    expect(pinIsActief('/trading', MORE_PIN)).toBe(false);
  });
});
