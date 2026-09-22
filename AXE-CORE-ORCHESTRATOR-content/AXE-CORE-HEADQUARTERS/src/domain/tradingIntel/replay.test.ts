/**
 * Replay: de toekomst kan de toestand op cursor N niet veranderen.
 *
 * Twee reeksen met dezelfde eerste N+1 bars en een totaal andere toekomst moeten
 * op N exact hetzelfde frame geven: zelfde candles, zelfde indicatoren, zelfde
 * trades. En de naïeve manier — rekenen over alles, dan bij N kijken — geeft
 * aantoonbaar iets anders: daarom rekent de replay alleen op 0..N.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { replayFrame, replayWindow, type ReplayCandle, type ReplayTradeInput } from './replay';
import { pointOfControl } from './indicatorMath';

function series(n: number, seed: number, scale = 1, start = Date.parse('2026-02-02T00:00:00Z')): ReplayCandle[] {
  let x = seed;
  const rnd = () => { x = (x * 1103515245 + 12345) % 2 ** 31; return x / 2 ** 31; };
  let p = 2000 * scale;
  return Array.from({ length: n }, (_, i) => {
    const o = p; const c = o + (rnd() - 0.5) * 10 * scale;
    p = c;
    return {
      time: new Date(start + i * 3_600_000).toISOString(), open: o, close: c,
      high: Math.max(o, c) + rnd() * 5 * scale, low: Math.min(o, c) - rnd() * 5 * scale,
      volume: 100 + Math.floor(rnd() * 1000),
    };
  });
}

const N = 180;
const base = series(400, 3);
// Zelfde verleden t/m N, daarna een andere wereld (andere ruis, 40% hoger).
const future = [...base.slice(0, N + 1), ...series(219, 77, 1.4, Date.parse(base[N + 1].time))];

const trades: ReplayTradeInput[] = [
  { id: 1, side: 'buy', entryTime: base[100].time, exitTime: base[140].time, entryPrice: 2001, exitPrice: 2010, stopLoss: 1990, takeProfit: 2015, lots: 1, pnl: 900, exitReason: 'target' },
  { id: 2, side: 'sell', entryTime: base[170].time, exitTime: base[260].time, entryPrice: 2003, exitPrice: 1995, stopLoss: 2012, takeProfit: 1990, lots: 0.5, pnl: 400, exitReason: 'target' },
  { id: 3, side: 'buy', entryTime: base[300].time, exitTime: base[320].time, entryPrice: 2004, exitPrice: 1999, stopLoss: 1998, takeProfit: 2012, lots: 1, pnl: -500, exitReason: 'stop' },
];

describe('replayFrame — geen blik vooruit', () => {
  it('dezelfde eerste N+1 bars geven hetzelfde frame, wat er daarna ook gebeurt', () => {
    expect(replayFrame(future, N, trades)).toEqual(replayFrame(base, N, trades));
  });

  it('voor elke cursor N: de indicatoren op N hangen alleen van bars 0..N af', () => {
    for (let n = 20; n <= N; n += 7) {
      const a = replayFrame(base, n).indicators;
      const b = replayFrame([...base.slice(0, n + 1), ...series(50, n, 3, Date.parse(base[n + 1].time))], n).indicators;
      expect(b, `cursor ${n}`).toEqual(a);
    }
  });

  it('een uitstap na de cursor bestaat nog niet; de positie staat open met stop en doel', () => {
    const f = replayFrame(base, N, trades);
    expect(f.markers.map(m => `${m.tradeId}${m.kind}`)).toEqual(['1entry', '1exit', '2entry']);
    expect(f.openTrades).toEqual([expect.objectContaining({ tradeId: 2, stopLoss: 2012, takeProfit: 1990 })]);
    expect(f.closedTrades).toBe(1);
    expect(f.realizedPnl).toBe(900);
  });

  it('de naïeve manier lekt: point of control over alles ≠ over 0..N', () => {
    const naive = pointOfControl(future.map(c => ({ ...c, time: Date.parse(c.time) / 1000 })), 400)?.price;
    const honest = replayFrame(future, N).indicators.pointOfControl;
    const honestAgain = pointOfControl(replayWindow(future, N).map(c => ({ ...c, time: Date.parse(c.time) / 1000 })))?.price;
    expect(honest).toBe(honestAgain);
    expect(naive).not.toBe(honest);
  });

  it('cursor buiten de reeks wordt begrensd', () => {
    expect(replayFrame(base, 10_000).cursor).toBe(399);
    expect(replayFrame(base, -5).candles).toEqual([]);
  });
});

describe('de replay en de lab gebruiken de 48-bar-benadering van smcDetect niet', () => {
  it('geen import van smcDetect in replay, strategyLab of simulate', () => {
    const root = join(__dirname, '..', '..');
    const files = [
      'domain/tradingIntel/replay.ts',
      'domain/tradingIntel/strategyLab/simulate.ts',
      'application/tradingIntel/strategyLab.ts',
      ...readdirSync(join(root, 'presentation/pages/tradingIntel/lab')).map(f => `presentation/pages/tradingIntel/lab/${f}`),
    ].filter(f => statSync(join(root, f)).isFile());
    const hits = files.filter(f => /smcDetect/.test(readFileSync(join(root, f), 'utf8')));
    expect(hits).toEqual([]);
  });
});
