import { describe, it, expect } from 'vitest';
import { chatBlijftLuisteren, injecteerJobResultaat } from './injecteerJobResultaat';

describe('injecteerJobResultaat', () => {
  it('plakt een samenvatting zonder de gebruiker te overschrijven', () => {
    const conv = [
      { role: 'user' as const, text: 'three jobs', timestamp: 1 },
      { role: 'axe' as const, text: 'On it — 3 jobs.', timestamp: 2 },
    ];
    const next = injecteerJobResultaat(conv, 'NorthSea Desk: 3 open deals');
    expect(next).toHaveLength(3);
    expect(next[2].role).toBe('axe');
    expect(next[2].text).toMatch(/3 open deals/);
    expect(next[0]).toEqual(conv[0]);
  });

  it('luisteren blijft luisteren', () => {
    expect(chatBlijftLuisteren('listening')).toBe(true);
    expect(chatBlijftLuisteren('idle')).toBe(false);
  });
});
