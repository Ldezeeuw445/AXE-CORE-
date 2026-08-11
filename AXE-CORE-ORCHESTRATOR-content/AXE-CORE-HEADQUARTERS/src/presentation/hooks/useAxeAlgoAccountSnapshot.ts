/**
 * useAxeAlgoAccountSnapshot — light, standalone account/positions poll for
 * surfaces outside the Trading tab (RightPanel widget). Deliberately does
 * NOT reuse useTradingDeskState — that hook also drives autopilot/circuit
 * breaker/scorecard fetching meant to run once for the whole app (already
 * happening in axeBootstrap), so mounting the full hook here a second time
 * would double every poll. This just reads current state.
 */
import { useEffect, useState } from 'react';
import { getBrokerConnection } from '@/infrastructure/gateways/brokerConnector';
import { getMetaApiConfig, metaApiGetAccountInfo, metaApiGetPositions, type MetaApiAccountBalance } from '@/infrastructure/gateways/metaApiService';
import { getDemoAccount, equity as paperEquity } from '@/infrastructure/persistence/demoTradingService';
import type { BrokerConnection } from '@/domain/tradingIntel/botTypes';

export interface AxeAlgoPositionSummary {
  symbol: string;
  side: string;
  volume: number;
  profit: number | null;
}

export interface AxeAlgoAccountSnapshot {
  broker: BrokerConnection | null;
  isReal: boolean;
  equity: number | null;
  currency: string | null;
  positions: AxeAlgoPositionSummary[];
  loading: boolean;
}

function rawSide(type: unknown): string {
  return String(type ?? '').toUpperCase().includes('SELL') ? 'sell' : 'buy';
}

export function useAxeAlgoAccountSnapshot(pollMs = 20_000): AxeAlgoAccountSnapshot {
  const [snap, setSnap] = useState<AxeAlgoAccountSnapshot>({
    broker: null, isReal: false, equity: null, currency: null, positions: [], loading: true,
  });

  useEffect(() => {
    let cancelled = false;
    const poll = async () => {
      const broker = await getBrokerConnection();
      const meta = await getMetaApiConfig();
      const isReal = Boolean(meta?.enabled && broker.kind === 'mt5_demo' && broker.connected);

      if (isReal) {
        const [balRes, posRes] = await Promise.all([metaApiGetAccountInfo(), metaApiGetPositions()]);
        if (cancelled) return;
        const bal: MetaApiAccountBalance | null = balRes.ok ? balRes.info : null;
        const positions: AxeAlgoPositionSummary[] = posRes.ok
          ? (posRes.positions as Record<string, unknown>[]).map(p => ({
              symbol: String(p.symbol ?? ''),
              side: rawSide(p.type),
              volume: Number(p.volume ?? 0),
              profit: typeof p.profit === 'number' ? p.profit : null,
            }))
          : [];
        setSnap({ broker, isReal: true, equity: bal?.equity ?? null, currency: bal?.currency ?? null, positions, loading: false });
        return;
      }

      const acc = await getDemoAccount();
      if (cancelled) return;
      setSnap({
        broker,
        isReal: false,
        equity: paperEquity(acc),
        currency: acc.currency,
        positions: acc.positions.map(p => ({
          symbol: p.symbol,
          side: p.qty >= 0 ? 'buy' : 'sell',
          volume: Math.abs(p.qty),
          profit: p.markPrice != null ? (p.markPrice - p.avgPrice) * p.qty : null,
        })),
        loading: false,
      });
    };
    void poll();
    const t = setInterval(poll, pollMs);
    return () => { cancelled = true; clearInterval(t); };
  }, [pollMs]);

  return snap;
}
