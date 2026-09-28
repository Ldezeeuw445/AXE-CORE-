import { describe, it, expect } from 'vitest';
import { splitIntoSpeechChunks, revealCut } from './speechChunks';

describe('splitIntoSpeechChunks', () => {
  it('splits on sentence ends so the first sentence can play early', () => {
    const c = splitIntoSpeechChunks('Morning, Luka. Companion is live. Want me to deploy it?');
    expect(c).toEqual(['Morning, Luka.', 'Companion is live.', 'Want me to deploy it?']);
  });

  it('never splits on an abbreviation or a decimal', () => {
    const c = splitIntoSpeechChunks('Use a faster model, e.g. fp16, for 1.5x speed. That should help a lot.');
    expect(c).toEqual(['Use a faster model, e.g. fp16, for 1.5x speed.', 'That should help a lot.']);
  });

  it('merges pieces too short to sound natural on their own', () => {
    const c = splitIntoSpeechChunks('Ok. Yes. The deploy finished without errors.');
    expect(c[0]).toBe('Ok. Yes. The deploy finished without errors.');
  });

  it('keeps every chunk within maxLen and loses no words', () => {
    const long = Array.from({ length: 120 }, (_, i) => `word${i}`).join(' ');
    const c = splitIntoSpeechChunks(long, 100);
    expect(c.every(s => s.length <= 100)).toBe(true);
    expect(c.join(' ').split(' ')).toEqual(long.split(' '));
  });

  it('prefers commas over a hard word cut inside a long sentence', () => {
    const s = `${'a'.repeat(60)} first part, ${'b'.repeat(60)} second part, and the end.`;
    const c = splitIntoSpeechChunks(s, 90);
    expect(c[0].endsWith('first part,')).toBe(true);
  });

  it('treats newlines as boundaries and returns nothing for empty text', () => {
    expect(splitIntoSpeechChunks('Line one here\nLine two here')).toEqual(['Line one here', 'Line two here']);
    expect(splitIntoSpeechChunks('   \n  ')).toEqual([]);
  });
});

describe('revealCut', () => {
  const t = 'Companion is live on the server';
  it('shows nothing at the start and everything at the end', () => {
    expect(revealCut(t, 0)).toBe(0);
    expect(revealCut(t, 1)).toBe(t.length);
    expect(revealCut(t, 2)).toBe(t.length);
  });
  it('never cuts inside a word', () => {
    for (let f = 0.05; f < 1; f += 0.05) {
      const cut = revealCut(t, f);
      expect(cut === t.length || /\s/.test(t[cut])).toBe(true);
    }
  });
  it('only moves forward as the voice progresses', () => {
    let last = 0;
    for (let f = 0; f <= 1; f += 0.02) {
      const cut = revealCut(t, f);
      expect(cut).toBeGreaterThanOrEqual(last);
      last = cut;
    }
  });
});
