/**
 * The CSV importer is how a broker's own record gets in when MetaAPI is not
 * the source. It had no tests, and it is a parser — header aliases, delimiter
 * guessing, quoted cells, European decimals. Those are exactly the places a
 * silent mis-read turns a losing account into a winning one on screen.
 */
import { describe, it, expect } from 'vitest';
import { parseJournalCsv, computeJournalAnalytics } from './csvJournalAnalytics';

const MT5 = [
  'Symbol,Type,Volume,Open Time,Close Time,Open Price,Close Price,S/L,T/P,Commission,Swap,Profit,Comment',
  'XAUUSD,buy,0.10,2026-08-20 09:00:00,2026-08-20 15:00:00,4600.00,4650.00,4580,4700,-1.20,-0.30,50.00,AXE golden-pocket h4',
  'BTCUSD,sell,0.02,2026-08-21 10:00:00,2026-08-21 12:00:00,79000,79500,80000,78000,-0.80,0,-10.00,AXE trend-follow h1',
].join('\n');

describe('parseJournalCsv', () => {
  it('reads a standard MT5 export', () => {
    const r = parseJournalCsv(MT5);
    expect(r.ok).toBe(true);
    expect(r.trades).toHaveLength(2);
    const [gold, btc] = r.trades;
    expect(gold.symbol).toBe('XAUUSD');
    expect(gold.side).toBe('buy');
    expect(gold.volume).toBe(0.1);
    expect(gold.profit).toBe(50);
    expect(gold.commission).toBe(-1.2);
    expect(btc.side).toBe('sell');
    expect(btc.profit).toBe(-10);
  });

  it('accepts the other names brokers use for the same columns', () => {
    // A broker calling it "Instrument" and "P/L" is not a broken export.
    const alt = [
      'Instrument;Direction;Lots;P/L',
      'EURUSD;buy;0.50;12.34',
    ].join('\n');
    const r = parseJournalCsv(alt);
    expect(r.ok).toBe(true);
    expect(r.trades[0]).toMatchObject({ symbol: 'EURUSD', side: 'buy', volume: 0.5, profit: 12.34 });
  });

  it('detects semicolon and tab exports, not just commas', () => {
    const tabbed = 'Symbol\tType\tProfit\nXAUUSD\tbuy\t25.00';
    const r = parseJournalCsv(tabbed);
    expect(r.ok).toBe(true);
    expect(r.trades[0].profit).toBe(25);
  });

  it('says what it could not find rather than importing nothing quietly', () => {
    const r = parseJournalCsv('Date,Notes\n2026-08-20,hello');
    expect(r.ok).toBe(false);
    expect(r.error).toContain('Symbol');
    // The header is echoed back so the person can see what it actually read.
    expect(r.error).toContain('Date');
  });

  it('refuses a file with no data rows', () => {
    expect(parseJournalCsv('Symbol,Profit').ok).toBe(false);
    expect(parseJournalCsv('').ok).toBe(false);
  });

  it('skips unusable rows and counts them instead of dropping them silently', () => {
    // A row with no profit is not a trade. Reporting the count is what lets
    // someone notice that half their export did not land.
    const r = parseJournalCsv([
      'Symbol,Profit',
      'XAUUSD,10',
      ',50',
      'BTCUSD,',
      'ETHUSD,5',
    ].join('\n'));
    expect(r.ok).toBe(true);
    expect(r.trades).toHaveLength(2);
    expect(r.skippedRows).toBe(2);
  });

  it('keeps a quoted comma inside one cell', () => {
    const r = parseJournalCsv([
      'Symbol,Profit,Comment',
      'XAUUSD,10,"AXE fib, retested"',
    ].join('\n'));
    expect(r.trades[0].comment).toBe('AXE fib, retested');
  });
});

describe('computeJournalAnalytics on imported trades', () => {
  it('agrees with the raw file about whether the account made money', () => {
    // 50 − 1.20 − 0.30 = 48.50, and −10 − 0.80 = −10.80. Costs are part of the
    // result, so the honest total is 37.70 rather than the 40 the profit
    // column alone suggests.
    const { trades } = parseJournalCsv(MT5);
    const a = computeJournalAnalytics(trades);
    expect(a.totalTrades).toBe(2);
    expect(a.wins).toBe(1);
    expect(a.losses).toBe(1);
    expect(a.netProfit).toBeCloseTo(37.7, 5);
  });

  it('is empty rather than broken on an empty import', () => {
    const a = computeJournalAnalytics([]);
    expect(a.totalTrades).toBe(0);
    expect(a.netProfit).toBe(0);
  });
});
