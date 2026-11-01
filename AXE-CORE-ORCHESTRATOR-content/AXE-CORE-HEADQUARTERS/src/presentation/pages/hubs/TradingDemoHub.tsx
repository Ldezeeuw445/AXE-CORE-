import { HubV3 } from '@/presentation/components/v3/HubV3';

/**
 * Trading demo hub — v3 tile grid. Demo only; no live orders from Core.
 */
export default function TradingDemoHub() {
  return (
    <HubV3
      tab="trading"
      title="Trading"
      sub="Demo hub · geen live orders"
      tiles={[
        { id: 'desk', label: 'Desk', note: 'Trading Desk', badge: 'ex', badgeTone: 'ex', path: '/trading-desk' },
        { id: 'intel', label: 'Intel', note: 'Trading Intel', badge: 'ex', badgeTone: 'ex', path: '/trading-intel' },
        { id: 'memory', label: 'Memory', note: 'Trading Memory', badge: 'docs', badgeTone: 'docs', path: '/memory/trading' },
        { id: 'risk', label: 'Risk', note: 'Risk panel', badge: 'ex', badgeTone: 'ex', path: '/trading-desk' },
        { id: 'pnl', label: 'PnL', note: 'PnL snapshot · demo', badge: 'ex', badgeTone: 'ex', path: '/trading-intel' },
        { id: 'watch', label: 'Watch', note: 'Watchlist', badge: 'stage', badgeTone: 'stage', path: '/trading-intel' },
      ]}
    />
  );
}
