import { describe, it, expect } from 'vitest';
import {
  eventWithin48h, isHighImpact, currenciesOf, HIGH_IMPACT_US_RELEASES,
} from './economicCalendar';

const NOW = Date.parse('2026-08-27T09:00:00Z');
const ev = (date: string, name: string) => ({ date, name });

describe('isHighImpact', () => {
  it('recognises the releases that reprice the dollar', () => {
    expect(isHighImpact('Employment Situation')).toBe(true);
    expect(isHighImpact('Consumer Price Index')).toBe(true);
    expect(isHighImpact('Producer Price Index')).toBe(true);
  });

  it('leaves FOMC out, because FRED cannot schedule it', () => {
    // release_id 101 returns 127 consecutive calendar days. Treating that as a
    // schedule flags an event within 48h every day of the year, which turns
    // this gate into a permanently closed desk. A real gap, deliberately.
    expect(isHighImpact('FOMC Press Release')).toBe(false);
  });

  it('does NOT match the near-identical releases FRED publishes beside them', () => {
    // These are real FRED release names seen in the same 45-day window. A
    // substring match on "consumer price" or "employment" catches all of them
    // and would stand the desk aside most days of the month.
    for (const decoy of [
      'Research Consumer Price Index',
      'Gross Domestic Product by State',
      'Gross Domestic Product by Industry',
      'Metropolitan Area Employment and Unemployment',
      'Personal Income by State',
      'State Employment and Unemployment',
      'Texas Employment Data',
    ]) {
      expect(isHighImpact(decoy), decoy).toBe(false);
    }
  });

  it('tolerates surrounding whitespace', () => {
    expect(isHighImpact('  Consumer Price Index ')).toBe(true);
  });

  it('stays short on purpose — this gate blocks trading', () => {
    expect(HIGH_IMPACT_US_RELEASES.size).toBeLessThanOrEqual(10);
  });
});

describe('currenciesOf', () => {
  it('splits six-letter symbols down the middle', () => {
    expect(currenciesOf('EURUSD')).toEqual(['EUR', 'USD']);
    expect(currenciesOf('XAUUSD')).toEqual(['XAU', 'USD']);
    expect(currenciesOf('btcusd')).toEqual(['BTC', 'USD']);
  });

  it('refuses to guess at anything else', () => {
    for (const odd of ['US500', 'EURUSD.PRO', '', 'EUR']) {
      expect(currenciesOf(odd), odd).toEqual([]);
    }
  });
});

describe('eventWithin48h', () => {
  it('flags a pair when a high-impact print lands tomorrow', () => {
    expect(eventWithin48h({
      pairId: 'EURUSD', now: NOW, events: [ev('2026-08-28', 'Consumer Price Index')],
    })).toBe(true);
  });

  it('counts today as occupied — a print at 08:30 New York is still ahead', () => {
    expect(eventWithin48h({
      pairId: 'EURUSD', now: NOW, events: [ev('2026-08-27', 'Employment Situation')],
    })).toBe(true);
  });

  it('clears a pair when the window holds nothing that matters', () => {
    expect(eventWithin48h({
      pairId: 'EURUSD', now: NOW,
      events: [ev('2026-08-27', 'Coinbase Cryptocurrencies'), ev('2026-08-28', 'Dow Jones Averages')],
    })).toBe(false);
  });

  it('ignores a release beyond the 48h window', () => {
    expect(eventWithin48h({
      pairId: 'EURUSD', now: NOW, events: [ev('2026-09-04', 'Employment Situation')],
    })).toBe(false);
  });

  it('ignores a release that has already passed', () => {
    expect(eventWithin48h({
      pairId: 'EURUSD', now: NOW, events: [ev('2026-08-20', 'FOMC Press Release')],
    })).toBe(false);
  });

  describe('says "not checked" rather than "all clear" when it cannot know', () => {
    it('for a pair with no covered currency', () => {
      // A US calendar cannot clear EURGBP. Returning false would make the
      // funnel treat silence as an all-clear, which is worse than no calendar.
      expect(eventWithin48h({
        pairId: 'EURGBP', now: NOW, events: [ev('2026-08-28', 'Consumer Price Index')],
      })).toBeNull();
    });

    it('for an unrecognised symbol', () => {
      expect(eventWithin48h({ pairId: 'US500', now: NOW, events: [ev('2026-08-28', 'Consumer Price Index')] })).toBeNull();
    });

    it('when the calendar could not be fetched', () => {
      expect(eventWithin48h({ pairId: 'EURUSD', now: NOW, events: null })).toBeNull();
      expect(eventWithin48h({ pairId: 'EURUSD', now: NOW, events: [] })).toBeNull();
    });
  });

  it('survives a malformed date without throwing', () => {
    expect(eventWithin48h({
      pairId: 'EURUSD', now: NOW,
      events: [ev('niet-een-datum', 'Employment Situation'), ev('2026-08-28', 'Consumer Price Index')],
    })).toBe(true);
  });
});
