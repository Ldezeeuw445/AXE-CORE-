import { describe, it, expect } from 'vitest';
import { jobStukkenVan, splitsAxeBeurten } from './splitsAxeBeurten';

describe('splitsAxeBeurten', () => {
  it.each([
    [
      'check NorthSea deals, zet een taak voor morgen, en vat het AI-nieuws samen',
      ['check NorthSea deals', 'zet een taak voor morgen', 'vat het AI-nieuws samen'],
    ],
    [
      'check NorthSea deals, add a task for tomorrow, and summarize today\'s AI news',
      ['check NorthSea deals', 'add a task for tomorrow', "summarize today's AI news"],
    ],
  ])('knipt "%s"', (text, expected) => {
    const stukken = splitsAxeBeurten(text);
    expect(stukken.map((s) => s.text)).toEqual(expected);
    expect(jobStukkenVan(stukken)).toHaveLength(3);
  });

  it('houdt een enkele vraag bij elkaar', () => {
    const s = splitsAxeBeurten('hey axe, wat is de bitcoin koers');
    expect(s).toHaveLength(1);
    expect(s[0].route.tier).toBe(2);
  });

  it('houdt een groet bij elkaar', () => {
    expect(splitsAxeBeurten('hey axe')).toHaveLength(1);
    expect(splitsAxeBeurten('hey axe')[0].route.kind).toBe('greeting');
  });

  it('zet de juiste agent op elk stuk', () => {
    const s = splitsAxeBeurten('check NorthSea deals, zet een taak voor morgen, en vat het AI-nieuws samen');
    expect(s[0].route.agent).toBe('northsea');
    expect(s[1].route.agent).toBe('task');
    expect(s[2].route.tier).toBe(2);
  });
});
