import { describe, expect, it } from 'vitest';
import { moetResearchDraaien } from './researchVers';
import type { TradingIntelReport } from './types';

const NU = Date.parse('2026-09-14T10:00:00Z');
const rapport = (ticker: string, status: TradingIntelReport['status'], minutenGeleden: number) =>
  ({ ticker, status, thesis: 't', updatedAt: new Date(NU - minutenGeleden * 60_000).toISOString(), createdAt: '' }) as TradingIntelReport;

describe('moetResearchDraaien', () => {
  it('slaat over bij een afgerond rapport van minder dan een uur', () => {
    const b = moetResearchDraaien([rapport('xauusd', 'complete', 20)], 'XAUUSD', NU);
    expect(b).toMatchObject({ draaien: false, reden: 'vers' });
  });

  it('draait weer als het rapport ouder is dan een uur', () => {
    expect(moetResearchDraaien([rapport('XAUUSD', 'complete', 61)], 'XAUUSD', NU).draaien).toBe(true);
  });

  it('start er geen tweede naast een onderzoek dat nog loopt', () => {
    expect(moetResearchDraaien([rapport('EURUSD', 'running', 3)], 'EURUSD', NU)).toMatchObject({ reden: 'bezig' });
  });

  it('een achtergelaten running en een ander symbool tellen niet', () => {
    const rs = [rapport('EURUSD', 'running', 45), rapport('BTCUSD', 'complete', 5), rapport('EURUSD', 'failed', 2)];
    expect(moetResearchDraaien(rs, 'EURUSD', NU).draaien).toBe(true);
  });
});
