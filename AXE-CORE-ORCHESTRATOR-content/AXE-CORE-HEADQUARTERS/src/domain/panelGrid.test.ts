import { describe, it, expect } from 'vitest';
import { panelOrder, panelRowTracks, panelColumnTracks } from './panelGrid';

const ROWS = [{ id: 'book', grow: true }, { id: 'stats' }, { id: 'risk' }];
const ITEMS = ['oanda', 'mt5', 'ftmo'];

const seq = (wide: boolean) => panelOrder(ITEMS, ROWS, wide).map(c => `${c.rowId}:${c.itemKey}`);

describe('order on a wide screen', () => {
  it('is row-major — every account\'s first card, then every second', () => {
    // This IS the alignment. A grid row is as tall as its tallest cell, so the
    // three "stats" cards land in one row and stretch to match each other.
    expect(seq(true)).toEqual([
      'book:oanda', 'book:mt5', 'book:ftmo',
      'stats:oanda', 'stats:mt5', 'stats:ftmo',
      'risk:oanda', 'risk:mt5', 'risk:ftmo',
    ]);
  });
});

describe('order on a narrow screen', () => {
  it('is item-major — each account complete, in order', () => {
    // Row-major collapsed to one column reads book, book, book, stats, stats,
    // stats: every account's numbers two accounts away from its own book.
    expect(seq(false)).toEqual([
      'book:oanda', 'stats:oanda', 'risk:oanda',
      'book:mt5', 'stats:mt5', 'risk:mt5',
      'book:ftmo', 'stats:ftmo', 'risk:ftmo',
    ]);
  });

  it('is a different sequence from wide, not a different width', () => {
    // Worth stating: this cannot be done with a media query, because the two
    // layouts are different DOM orders.
    expect(seq(false)).not.toEqual(seq(true));
    expect(seq(false).slice().sort()).toEqual(seq(true).slice().sort());
  });
});

describe('both orders', () => {
  it('place every card exactly once', () => {
    for (const wide of [true, false]) {
      const cells = panelOrder(ITEMS, ROWS, wide);
      expect(cells).toHaveLength(ITEMS.length * ROWS.length);
      expect(new Set(cells.map(c => `${c.rowId}:${c.itemKey}`)).size).toBe(cells.length);
    }
  });

  it('survive a single item and a single row', () => {
    expect(panelOrder(['solo'], [{ id: 'only' }], true)).toEqual([{ rowId: 'only', itemKey: 'solo' }]);
    expect(panelOrder([], ROWS, true)).toEqual([]);
    expect(panelOrder(ITEMS, [], false)).toEqual([]);
  });
});

describe('track sizes', () => {
  it('lets only the growing row absorb slack', () => {
    expect(panelRowTracks(ROWS)).toBe('minmax(0, 1fr) min-content min-content');
  });

  it('gives every column a zero minimum, so long content scrolls instead of pushing', () => {
    // 1fr alone refuses to shrink below its content -- that is how a list of
    // 164 closed trades stops scrolling and starts setting the page width.
    expect(panelColumnTracks(3)).toBe('repeat(3, minmax(0, 1fr))');
    expect(panelRowTracks([{ id: 'a', grow: true }])).toContain('minmax(0, 1fr)');
  });
});
