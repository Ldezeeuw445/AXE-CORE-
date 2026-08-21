/**
 * The tap-by-label rule, on its own.
 *
 * Mocking the bridge would leave the part that can actually press the wrong
 * button untested — the resolver is pure, so it is tested pure. Measured on
 * the real phone: a Google page offers both "Inloggen" and "Inloggen om aan
 * te passen", and a substring-first resolver presses the second one.
 */
import { describe, it, expect } from 'vitest';
import { findElement, formatElements, type PhoneElement } from './phoneBridgeService';

const el = (label: string, x = 10, y = 20, tap = true): PhoneElement => ({ label, x, y, tap });

describe('findElement', () => {
  it('prefers an exact label over a longer one containing it', () => {
    const els = [el('Inloggen om aan te passen', 760, 2205), el('Inloggen', 939, 342)];
    expect(findElement(els, 'Inloggen')?.x).toBe(939);
  });

  it('is case-insensitive and ignores surrounding spaces', () => {
    expect(findElement([el('Accepteren')], '  accepteren ')?.label).toBe('Accepteren');
  });

  it('falls back to a contains-match, preferring one that is tappable', () => {
    const els = [
      { label: 'Zoekresultaten voor weer', x: 1, y: 1, tap: false },
      el('Weer in Rotterdam', 500, 900),
    ];
    expect(findElement(els, 'weer in')?.x).toBe(500);
  });

  it('returns null rather than guessing when nothing matches', () => {
    expect(findElement([el('Nieuws')], 'Instellingen')).toBeNull();
  });

  it('treats an empty label as no match, not as "the first element"', () => {
    expect(findElement([el('Nieuws')], '   ')).toBeNull();
  });
});

describe('formatElements', () => {
  it('marks fields and tappables differently so the model can tell them apart', () => {
    const out = formatElements([
      { label: 'Zoeken', x: 100, y: 200, editable: true },
      el('Verstuur', 300, 400),
    ]);
    expect(out).toContain('FIELD Zoeken @ 100,200');
    expect(out).toContain('TAP   Verstuur @ 300,400');
  });

  it('says how many it left out instead of silently truncating', () => {
    const many = Array.from({ length: 45 }, (_, i) => el(`item ${i}`));
    expect(formatElements(many, 40)).toContain('… 5 more');
  });

  it('says so when the screen has nothing readable', () => {
    expect(formatElements([])).toBe('(nothing readable on screen)');
  });
});
