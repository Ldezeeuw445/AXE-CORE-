import { describe, it, expect } from 'vitest';
import { huidigGesprek, zonderDubbeleGroeten, type Regel } from './huidigGesprek';

const MIN = 60_000;
const NU = 1_000 * MIN;
const r = (role: Regel['role'], text: string, minGeleden: number): Regel => ({ role, text, timestamp: NU - minGeleden * MIN });

describe('de wolk toont het gesprek van nu', () => {
  it('na een lange pauze begint de wolk leeg; AXE weet het nog wel', () => {
    const alles = [r('user', 'hoi', 300), r('axe', 'hey', 299)];
    expect(huidigGesprek(alles, NU)).toEqual([]);
  });

  it('alles sinds de laatste pauze blijft staan', () => {
    const alles = [r('user', 'oud', 300), r('user', 'open safari', 10), r('axe', 'Safari staat open.', 9)];
    expect(huidigGesprek(alles, NU).map(m => m.text)).toEqual(['open safari', 'Safari staat open.']);
  });

  it('de stapel begroetingen uit de screenshot wordt er één', () => {
    const alles = [
      r('axe', 'Goedemorgen, Luka. Het belangrijkste: A', 30),
      r('axe', 'Goedemorgen, Luka. Het belangrijkste: B', 20),
      r('axe', 'Goedemorgen, Luka. AXE is online.', 10),
      r('user', 'wat staat er vandaag?', 5),
    ];
    expect(huidigGesprek(alles, NU).map(m => m.text)).toEqual([
      'Goedemorgen, Luka. AXE is online.',
      'wat staat er vandaag?',
    ]);
  });

  it('een groet van Luka zelf is geen begroeting van AXE', () => {
    const alles = [r('user', 'Goedemorgen AXE', 3), r('user', 'Goedemorgen nog een keer', 2)];
    expect(zonderDubbeleGroeten(alles)).toHaveLength(2);
  });
});
