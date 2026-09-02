/**
 * The export is only a format if the importer can read it back. These tests
 * run the round trip, because the moment the two drift a column goes missing
 * and the numbers change without anything failing.
 *
 * They live in application/ rather than beside the writer in domain/: the
 * round trip touches both layers, and domain may not reach outward. Putting
 * the test where both are visible is the honest place for it.
 */
import { describe, it, expect } from 'vitest';
import { tradesToCsv, exportFilename, type ExportableTrade } from '@/domain/tradingIntel/tradeCsv';
import { parseJournalCsv } from './csvJournalAnalytics';

function trade(over: Partial<ExportableTrade> = {}): ExportableTrade {
  return {
    symbol: 'XAUUSD', side: 'buy', volume: 0.1,
    openTime: '2026-08-20 09:00:00', closeTime: '2026-08-20 15:00:00',
    openPrice: 4600, closePrice: 4650,
    stopLoss: 4580, takeProfit: 4700,
    commission: -1.2, swap: -0.3, profit: 50,
    comment: 'AXE golden-pocket h4',
    ...over,
  };
}

describe('tradesToCsv', () => {
  it('writes a header the importer recognises', () => {
    const csv = tradesToCsv([trade()]);
    expect(csv.split('\n')[0]).toBe(
      'Symbol,Type,Volume,Open Time,Close Time,Open Price,Close Price,S/L,T/P,Commission,Swap,Profit,Comment',
    );
  });

  it('quotes a comment containing a comma', () => {
    // Unquoted, this splits into two columns and shifts Profit one place left —
    // a result silently becomes a price.
    const csv = tradesToCsv([trade({ comment: 'AXE fib, retested' })]);
    expect(csv).toContain('"AXE fib, retested"');
  });

  it('doubles a quote inside a cell', () => {
    const csv = tradesToCsv([trade({ comment: 'AXE "golden" pocket' })]);
    expect(csv).toContain('"AXE ""golden"" pocket"');
  });

  it('leaves an unknown number empty rather than writing zero', () => {
    // Zero is a value. Writing it where nothing is known makes the importer
    // read a real trade at price 0.
    const csv = tradesToCsv([trade({ stopLoss: null, takeProfit: null })]);
    const row = csv.split('\n')[1].split(',');
    expect(row[7]).toBe('');
    expect(row[8]).toBe('');
  });

  it('ends with a newline', () => {
    expect(tradesToCsv([trade()]).endsWith('\n')).toBe(true);
  });

  it('writes a header-only file for an empty account', () => {
    const csv = tradesToCsv([]);
    expect(csv.trim().split('\n')).toHaveLength(1);
  });
});

describe('round trip', () => {
  it('re-imports what it exported, unchanged', () => {
    const original = [
      trade(),
      trade({ symbol: 'BTCUSD', side: 'sell', volume: 0.02, profit: -10, commission: -0.8, swap: 0, comment: 'AXE trend-follow h1' }),
    ];
    const back = parseJournalCsv(tradesToCsv(original));
    expect(back.ok).toBe(true);
    expect(back.trades).toHaveLength(2);
    expect(back.skippedRows).toBe(0);

    for (const [i, t] of back.trades.entries()) {
      expect(t.symbol).toBe(original[i].symbol);
      expect(t.side).toBe(original[i].side);
      expect(t.volume).toBe(original[i].volume);
      expect(t.profit).toBe(original[i].profit);
      expect(t.commission).toBe(original[i].commission);
      expect(t.swap).toBe(original[i].swap);
    }
  });

  it('survives a comment with a comma through the round trip', () => {
    const back = parseJournalCsv(tradesToCsv([trade({ comment: 'AXE fib, retested' })]));
    expect(back.trades[0].comment).toBe('AXE fib, retested');
  });
});

describe('exportFilename', () => {
  it('names the account and the day so two exports never collide', () => {
    expect(exportFilename('OANDA DEMO 50K', new Date('2026-08-26T12:00:00Z')))
      .toBe('axe-oanda-demo-50k-2026-08-26.csv');
  });

  it('falls back rather than producing a nameless file', () => {
    expect(exportFilename('   ')).toMatch(/^axe-account-\d{4}-\d{2}-\d{2}\.csv$/);
  });
});
