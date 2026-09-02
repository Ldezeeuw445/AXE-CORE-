/**
 * The rounds exist so a change can be measured against a control. Two things
 * must hold for that to mean anything: run-1's stored keys cannot move, and a
 * new round cannot read the control's record.
 */
import { describe, it, expect } from 'vitest';
import { ledgerKey, normRun, DEFAULT_RUN } from './tradingLedgerService';

describe('normRun', () => {
  it('treats absent, empty and whitespace as the control round', () => {
    // Every account and every stored row that predates rounds is run-1. If any
    // of these fell through to something else, that data would be orphaned.
    expect(normRun(undefined)).toBe(DEFAULT_RUN);
    expect(normRun('')).toBe(DEFAULT_RUN);
    expect(normRun('   ')).toBe(DEFAULT_RUN);
  });

  it('is case-insensitive, so Run-2 and run-2 are one round', () => {
    expect(normRun('RUN-2')).toBe(normRun('run-2'));
  });
});

describe('ledgerKey', () => {
  it('leaves run-1 keys exactly where they already are', () => {
    // THE migration-free property. 115 live trades and every backtest prior
    // are stored under this shape; prefixing it would strand all of them under
    // a key nothing looks up, and the algo would start from zero believing it
    // had never traded.
    const legacy = 'tl:XAUUSD:volumetric-ob:h1';
    expect(ledgerKey('XAUUSD', 'volumetric-ob', 'h1')).toBe(legacy);
    expect(ledgerKey('XAUUSD', 'volumetric-ob', 'h1', 'run-1')).toBe(legacy);
    expect(ledgerKey('XAUUSD', 'volumetric-ob', 'h1', '')).toBe(legacy);
  });

  it('gives every other round its own namespace', () => {
    const second = ledgerKey('XAUUSD', 'volumetric-ob', 'h1', 'run-2');
    expect(second).toBe('tl:run-2:XAUUSD:volumetric-ob:h1');
    expect(second).not.toBe(ledgerKey('XAUUSD', 'volumetric-ob', 'h1'));
  });

  it('normalises the pair and strategy the same way in every round', () => {
    // A round that spelled a pair differently would quietly keep a second,
    // half-empty record for it.
    expect(ledgerKey(' xauusd ', 'volumetric-ob', 'h1', 'run-2'))
      .toBe(ledgerKey('XAUUSD', 'volumetric-ob', 'h1', 'run-2'));
  });

  it('keeps rounds apart even when everything else matches', () => {
    const keys = new Set([
      ledgerKey('BTCUSD', 'trend-follow', 'h4', 'run-1'),
      ledgerKey('BTCUSD', 'trend-follow', 'h4', 'run-2'),
      ledgerKey('BTCUSD', 'trend-follow', 'h4', 'run-3'),
    ]);
    expect(keys.size).toBe(3);
  });
});
