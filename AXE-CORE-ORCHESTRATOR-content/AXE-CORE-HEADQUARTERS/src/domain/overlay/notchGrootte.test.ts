import { describe, expect, it } from 'vitest';
import {
  GROOTTE_SLEUTEL, bewaarGrootte, grootteUitCmd, leesGrootte, stapTerug, toetsActie, wisselGrootte, zichtbareGrootte,
} from './notchGrootte';

function opslag(start: Record<string, string> = {}) {
  const m = new Map(Object.entries(start));
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), m };
}

describe('notchGrootte (Luka 27 nov: compact, groot alleen als hij het wil)', () => {
  it('begint compact en onthoudt de keuze', () => {
    const o = opslag();
    expect(leesGrootte(o)).toBe('compact');
    bewaarGrootte(o, 'groot');
    expect(o.m.get(GROOTTE_SLEUTEL)).toBe('groot');
    expect(leesGrootte(o)).toBe('groot');
  });

  it('een rare waarde of geen opslag valt terug op compact', () => {
    expect(leesGrootte(opslag({ [GROOTTE_SLEUTEL]: 'enorm' }))).toBe('compact');
    expect(leesGrootte(null)).toBe('compact');
    expect(leesGrootte({ getItem: () => { throw new Error('nee'); }, setItem: () => undefined })).toBe('compact');
    expect(() => bewaarGrootte({ getItem: () => null, setItem: () => { throw new Error('vol'); } }, 'groot')).not.toThrow();
  });

  it('⌘E en Ctrl+E wisselen, Esc stapt terug, de rest is niet van ons', () => {
    expect(toetsActie({ key: 'e', metaKey: true })).toBe('wissel');
    expect(toetsActie({ key: 'E', ctrlKey: true })).toBe('wissel');
    expect(toetsActie({ key: 'e' })).toBeNull();
    expect(toetsActie({ key: 'e', metaKey: true, altKey: true })).toBeNull();
    expect(toetsActie({ key: 'Escape' })).toBe('stap-terug');
    expect(wisselGrootte('compact')).toBe('groot');
    expect(wisselGrootte('groot')).toBe('compact');
  });

  it('Esc: groot → compact → dicht', () => {
    expect(stapTerug({ open: true, zichtbaar: 'groot' })).toEqual({ open: true, naarCompactHome: true });
    expect(stapTerug({ open: true, zichtbaar: 'compact' })).toEqual({ open: false, naarCompactHome: false });
    expect(stapTerug({ open: false, zichtbaar: 'compact' })).toEqual({ open: false, naarCompactHome: false });
  });

  it('chat en goedkeuringen zijn altijd groot, home en widgets volgen de keuze', () => {
    expect(zichtbareGrootte('chat', 'compact')).toBe('groot');
    expect(zichtbareGrootte('approvals', 'compact')).toBe('groot');
    expect(zichtbareGrootte('home', 'compact')).toBe('compact');
    expect(zichtbareGrootte('widgets', 'groot')).toBe('groot');
  });

  it('overlay.cmd kan een stand kiezen', () => {
    expect(grootteUitCmd('expand-large', 'compact')).toBe('groot');
    expect(grootteUitCmd('expand-compact', 'groot')).toBe('compact');
    expect(grootteUitCmd('toggle-size', 'compact')).toBe('groot');
    expect(grootteUitCmd('expand', 'compact')).toBeNull();
  });
});
