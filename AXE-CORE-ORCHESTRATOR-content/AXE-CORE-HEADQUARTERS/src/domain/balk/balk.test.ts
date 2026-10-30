import { describe, expect, it } from 'vitest';
import {
  kanVersturen,
  notchAfmeting,
  notchEscActie,
  notchHoverActie,
  notchSneltoetsActie,
  notchTabActie,
  notchToetsActie,
  NOTCH_AFMETINGEN,
  NOTCH_TABS,
} from './balk';

describe('NOTCH_TABS', () => {
  it('heeft precies zes tabs inclusief Home/Chat/Meldingen/Agents/NorthSea/Trading', () => {
    expect(NOTCH_TABS).toHaveLength(6);
    expect(NOTCH_TABS.map((t) => t.id)).toEqual([
      'home',
      'chat',
      'meldingen',
      'agents',
      'northsea',
      'trading',
    ]);
  });
});

describe('notchSneltoetsActie', () => {
  it('opent vanuit hidden/collapsed/hover', () => {
    expect(notchSneltoetsActie('hidden')).toBe('expanded');
    expect(notchSneltoetsActie('collapsed')).toBe('expanded');
    expect(notchSneltoetsActie('hover')).toBe('expanded');
  });
  it('klapt in vanuit expanded naar collapsed', () => {
    expect(notchSneltoetsActie('expanded')).toBe('collapsed');
  });
});

describe('notchHoverActie', () => {
  it('wisselt collapsed ↔ hover', () => {
    expect(notchHoverActie('collapsed', true)).toBe('hover');
    expect(notchHoverActie('hover', false)).toBe('collapsed');
  });
  it('raakt expanded en hidden niet', () => {
    expect(notchHoverActie('expanded', true)).toBe('expanded');
    expect(notchHoverActie('hidden', true)).toBe('hidden');
  });
});

describe('notchEscActie', () => {
  it('expanded/hover → collapsed, collapsed → hidden', () => {
    expect(notchEscActie('expanded')).toBe('collapsed');
    expect(notchEscActie('hover')).toBe('collapsed');
    expect(notchEscActie('collapsed')).toBe('hidden');
    expect(notchEscActie('hidden')).toBeNull();
  });
});

describe('notchTabActie', () => {
  it('home opent altijd het hoofdvenster', () => {
    expect(notchTabActie('home', null, 'collapsed')).toEqual({ soort: 'open-hoofdvenster' });
    expect(notchTabActie('home', 'chat', 'expanded')).toEqual({ soort: 'open-hoofdvenster' });
  });
  it('andere tab klapt uit / wisselt', () => {
    expect(notchTabActie('chat', null, 'collapsed')).toEqual({ soort: 'kies-tab', tab: 'chat' });
    expect(notchTabActie('agents', 'chat', 'expanded')).toEqual({
      soort: 'kies-tab',
      tab: 'agents',
    });
  });
  it('zelfde tab opnieuw klapt in', () => {
    expect(notchTabActie('meldingen', 'meldingen', 'expanded')).toEqual({
      soort: 'zet-stand',
      stand: 'collapsed',
    });
  });
});

describe('notchToetsActie', () => {
  it('Esc klapt in, de rest niets', () => {
    expect(notchToetsActie('Escape', 'expanded')).toEqual({
      soort: 'zet-stand',
      stand: 'collapsed',
    });
    expect(notchToetsActie('a', 'expanded')).toBeNull();
  });
});

describe('notchAfmeting', () => {
  it('volgt NOTCH_AFMETINGEN', () => {
    expect(notchAfmeting('collapsed')).toEqual(NOTCH_AFMETINGEN.collapsed);
    expect(notchAfmeting('hover')).toEqual(NOTCH_AFMETINGEN.hover);
    expect(notchAfmeting('expanded')).toEqual(NOTCH_AFMETINGEN.expanded);
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
