import { describe, it, expect } from 'vitest';
import { SNELACTIES, ACCENT_AFSTAND, accentAfstand } from './snelacties';

describe('snelacties', () => {
  it('heeft er vier, zoals het voorbeeld', () => {
    expect(SNELACTIES).toHaveLength(4);
  });

  it('geeft elke pil een eigen id, want de id is de sleutel in de lijst', () => {
    expect(new Set(SNELACTIES.map(a => a.id)).size).toBe(SNELACTIES.length);
  });

  it('heeft nergens een leeg label of een lege prompt', () => {
    for (const a of SNELACTIES) {
      expect(a.label.trim().length).toBeGreaterThan(0);
      // Een pil die niets in de composer zet is decoratie.
      expect(a.prompt.trim().length).toBeGreaterThan(0);
    }
  });

  it('schrijft elke accentkleur als volledige hex, want daar rekent accentAfstand op', () => {
    for (const a of SNELACTIES) expect(a.accent).toMatch(/^#[0-9A-Fa-f]{6}$/);
  });

  it('houdt de accenten ver genoeg uit elkaar om te kunnen onderscheiden', () => {
    for (let i = 0; i < SNELACTIES.length; i++) {
      for (let j = i + 1; j < SNELACTIES.length; j++) {
        const d = accentAfstand(SNELACTIES[i].accent, SNELACTIES[j].accent);
        expect(d, `${SNELACTIES[i].id} en ${SNELACTIES[j].id} liggen te dicht bij elkaar (${d})`)
          .toBeGreaterThanOrEqual(ACCENT_AFSTAND);
      }
    }
  });
});

describe('accentAfstand', () => {
  it('is nul voor dezelfde kleur', () => {
    expect(accentAfstand('#8B7CF6', '#8B7CF6')).toBe(0);
  });

  it('is maximaal voor zwart tegen wit', () => {
    expect(accentAfstand('#000000', '#FFFFFF')).toBe(442);
  });

  it('kan met en zonder hekje overweg', () => {
    expect(accentAfstand('8B7CF6', '#8B7CF6')).toBe(0);
  });
});
