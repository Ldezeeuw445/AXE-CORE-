import { describe, expect, it } from 'vitest';
import { middenVerschuiving, pasAfstand } from './wereldBeeld';

// Luka's telefoon-Home: wereldslot 376x786, wereldknoppen tot 50 van boven,
// composer vanaf 155 van onder (gemeten 28 sep).
const TELEFOON = { breedte: 376, hoogte: 786, vrij: { boven: 50, onder: 155 } };

describe('een 3D-wereld in het midden van de vrije ruimte', () => {
  it('schuift het beeld omhoog als de composer meer inneemt dan de knoppen', () => {
    expect(middenVerschuiving(TELEFOON.vrij)).toBe(52.5);
    expect(middenVerschuiving({ boven: 0, onder: 0 })).toBe(0);
  });

  it('zet de camera op een staand scherm verder weg dan op de desktop', () => {
    // Neural op de desktop: afstand 13, vfov 50, liggend. Een brein met straal
    // ~5 past daar. Op de telefoon beslist de smalle breedte.
    const tel = pasAfstand({ straal: 5, vfovGraden: 50, ...TELEFOON });
    const desk = pasAfstand({ straal: 5, vfovGraden: 50, breedte: 1440, hoogte: 900, vrij: { boven: 0, onder: 0 } });
    expect(tel).toBeGreaterThan(desk * 1.8);
    // Het geheel past in de breedte: de hoekstraal blijft binnen de halve kijkhoek.
    const tanH = Math.tan((50 * Math.PI) / 360) * (376 / 786);
    expect(5 / tel).toBeLessThan(tanH);
  });

  it('laat de vrije hoogte beslissen als die krapper is dan de breedte', () => {
    const breedLaag = pasAfstand({ straal: 5, vfovGraden: 50, breedte: 900, hoogte: 400, vrij: { boven: 60, onder: 200 } });
    const zonderBalken = pasAfstand({ straal: 5, vfovGraden: 50, breedte: 900, hoogte: 400, vrij: { boven: 0, onder: 0 } });
    expect(breedLaag).toBeGreaterThan(zonderBalken * 2);
  });
});
