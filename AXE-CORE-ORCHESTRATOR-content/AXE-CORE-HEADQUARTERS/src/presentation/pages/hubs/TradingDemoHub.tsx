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
      /* 17 nov, UI-ronde: de tegels zeiden alleen "EX"/"DOCS"/"STAGE" en een
         naam. Nu staat er wat erachter zit, en een label dat je kunt lezen. */
      tiles={[
        { id: 'desk', label: 'Desk', note: 'Trading Desk · posities en demo-orders', badge: 'demo', badgeTone: 'ex', path: '/trading-desk' },
        { id: 'intel', label: 'Intel', note: 'Trading Intel · markt, signalen, nieuws', badge: 'demo', badgeTone: 'ex', path: '/trading-intel' },
        { id: 'memory', label: 'Memory', note: 'Trading Memory · lessen en notities', badge: 'notities', badgeTone: 'docs', path: '/memory/trading' },
        { id: 'risk', label: 'Risk', note: 'Risico per positie · in de Desk', badge: 'demo', badgeTone: 'ex', path: '/trading-desk' },
        { id: 'pnl', label: 'PnL', note: 'Winst en verlies · demo-account', badge: 'demo', badgeTone: 'ex', path: '/trading-intel' },
        { id: 'watch', label: 'Watch', note: 'Watchlist · in Intel', badge: 'in opbouw', badgeTone: 'stage', path: '/trading-intel' },
      ]}
    />
  );
}
