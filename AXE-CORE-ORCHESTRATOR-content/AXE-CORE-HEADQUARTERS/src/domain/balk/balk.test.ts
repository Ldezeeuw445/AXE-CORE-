import { describe, expect, it } from 'vitest';
import { balkTabActie, balkToetsActie, kanVersturen } from './balk';

describe('balkTabActie', () => {
  it('home opent altijd het hoofdvenster', () => {
    expect(balkTabActie('home', null)).toEqual({ soort: 'open-hoofdvenster' });
    expect(balkTabActie('home', 'chat')).toEqual({ soort: 'open-hoofdvenster' });
  });
  it('chat klapt uit, nog een keer klapt in', () => {
    expect(balkTabActie('chat', null)).toEqual({ soort: 'uitklappen', tab: 'chat' });
    expect(balkTabActie('chat', 'chat')).toEqual({ soort: 'inklappen' });
  });
  it('wisselen van tab blijft uitgeklapt', () => {
    expect(balkTabActie('plus', 'chat')).toEqual({ soort: 'uitklappen', tab: 'plus' });
  });
});

describe('balkToetsActie', () => {
  it('Esc klapt in, de rest niets', () => {
    expect(balkToetsActie('Escape')).toEqual({ soort: 'inklappen' });
    expect(balkToetsActie('a')).toBeNull();
  });
});

describe('kanVersturen', () => {
  it('lege vraag zonder bestand niet', () => {
    expect(kanVersturen('   ', [])).toBe(false);
  });
  it('tekst of bestand wel', () => {
    expect(kanVersturen("What's the total?", [])).toBe(true);
    expect(kanVersturen('', ['/tmp/quote.pdf'])).toBe(true);
  });
});
