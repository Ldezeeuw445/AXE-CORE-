import { describe, expect, it } from 'vitest';
import { isKorteOpenOpdracht } from './navigatieZin';

describe('isKorteOpenOpdracht', () => {
  it('korte open-opdrachten', () => {
    for (const z of ['open trading', 'Open settings.', 'ga naar de agenda', 'hey axe, open managers', 'open de taken']) {
      expect(isKorteOpenOpdracht(z)).toBe(true);
    }
  });
  it('werk blijft werk', () => {
    for (const z of ['open een PR voor de login-fix in AXE Core', 'check de NorthSea deals', 'wat staat er in mijn agenda', '']) {
      expect(isKorteOpenOpdracht(z)).toBe(false);
    }
  });
});
