import { describe, it, expect } from 'vitest';
import { frameOpSchermen, ZWEVENDE_VENSTERS } from './zwevendeVensters';

// Luka, 9 okt: over elk scherm te verplaatsen. Een bewaarde plek op een scherm dat er niet meer is,
// mag het venster niet buiten beeld laten beginnen.
describe('zwevende vensters: een bewaarde plek moet op een bestaand scherm vallen', () => {
  const hoofd = { x: 0, y: 0, b: 1440, h: 900 };
  const tweede = { x: 1440, y: 0, b: 1920, h: 1080 };

  it('een plek op het hoofdscherm of op het tweede scherm klopt', () => {
    expect(frameOpSchermen({ x: 100, y: 100, b: 780, h: 540 }, [hoofd, tweede])).toBe(true);
    expect(frameOpSchermen({ x: 1700, y: 80, b: 780, h: 540 }, [hoofd, tweede])).toBe(true);
  });

  it('het tweede scherm is losgekoppeld: dezelfde plek valt nergens meer, dus in het midden beginnen', () => {
    expect(frameOpSchermen({ x: 1700, y: 80, b: 780, h: 540 }, [hoofd])).toBe(false);
  });

  it('een venster dat er maar een flard van op het scherm ligt telt niet', () => {
    expect(frameOpSchermen({ x: 1430, y: 100, b: 780, h: 540 }, [hoofd])).toBe(false);
  });

  it('beide vensters hebben een eigen label dat de rechten ("axe-*") dekken', () => {
    for (const o of Object.values(ZWEVENDE_VENSTERS)) expect(o.label).toMatch(/^axe-/);
  });
});
