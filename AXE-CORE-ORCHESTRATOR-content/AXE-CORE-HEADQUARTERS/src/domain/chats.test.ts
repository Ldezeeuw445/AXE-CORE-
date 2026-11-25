import { describe, expect, it } from 'vitest';
import { gesprekNaam, markeer, wanneer } from './chats';

describe('chats', () => {
  it('geeft managers hun echte naam en laat onbekende ids staan', () => {
    expect(gesprekNaam('AXE')).toBe('AXE');
    expect(gesprekNaam('iets-onbekends')).toBe('iets-onbekends');
    expect(gesprekNaam('companionmgr')).not.toBe('companionmgr');
  });

  it('markeert elk zoekwoord, hoofdletterongevoelig', () => {
    const d = markeer('Feed ververst; de feed is vers', 'feed');
    expect(d.filter(x => x.raak).map(x => x.tekst)).toEqual(['Feed', 'feed']);
    expect(d.map(x => x.tekst).join('')).toBe('Feed ververst; de feed is vers');
  });

  it('leest tijden als vandaag, gisteren of een datum', () => {
    const nu = new Date('2026-11-25T20:00:00');
    expect(wanneer('2026-11-25T14:05:00', nu)).toBe('14:05');
    expect(wanneer('2026-11-24T14:05:00', nu)).toBe('yesterday 14:05');
    expect(wanneer('2026-11-20T14:05:00', nu)).toMatch(/20 Nov 14:05/);
  });
});
