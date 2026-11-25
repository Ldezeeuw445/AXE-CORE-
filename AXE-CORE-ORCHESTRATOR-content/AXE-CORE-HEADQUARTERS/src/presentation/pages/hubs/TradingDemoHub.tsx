import { HubV3 } from '@/presentation/components/v3/HubV3';
import { DashKaart, DashLeeg } from '@/presentation/components/layout/dashboardSchil';
import { useAxeAlgoAccountSnapshot } from '@/presentation/hooks/useAxeAlgoAccountSnapshot';

/**
 * Trading demo hub — dashboard (25 nov). Demo only; no live orders from Core.
 *
 * Cijfers komen uit useAxeAlgoAccountSnapshot, dezelfde lichte poll als de
 * widget in het rechterpaneel. Alleen een gekoppelde MT5-demo telt: het
 * papieraccount van de app is geen rekening van Luka, dus dat tonen we hier
 * niet als equity. Zonder koppeling staat er eerlijk "—".
 */
function geld(n: number | null, cur: string | null): string {
  if (n == null) return '—';
  return `${cur ? `${cur} ` : ''}${n.toLocaleString('nl-NL', { maximumFractionDigits: 0 })}`;
}

export default function TradingDemoHub() {
  const snap = useAxeAlgoAccountSnapshot();
  const live = snap.isReal;
  const posities = live ? snap.positions : [];
  const openPnl = live ? posities.reduce((s, p) => s + (p.profit ?? 0), 0) : null;
  const geenKoppeling = snap.loading ? 'loading…' : 'no MT5 demo linked';

  return (
    <HubV3
      tab="trading"
      title="Trading"
      sub="Demo hub · no live orders"
      cijfers={[
        { label: 'Account', waarde: live ? 'MT5' : '—', sub: live ? 'demo linked' : geenKoppeling, toon: live ? 'ok' : undefined },
        { label: 'Equity', waarde: live ? geld(snap.equity, snap.currency) : '—', sub: live ? 'MetaAPI' : geenKoppeling },
        { label: 'Positions', waarde: live ? posities.length : '—', sub: live ? (posities[0]?.symbol ?? 'none open') : geenKoppeling },
        { label: 'P&L', waarde: openPnl == null ? '—' : geld(openPnl, snap.currency),
          toon: openPnl == null ? undefined : openPnl >= 0 ? 'ok' : 'fout', sub: live ? 'open positions' : geenKoppeling },
      ]}
      kaartVakken={1}
      kaarten={
        <DashKaart titel="Positions" telling={live ? posities.length : undefined}>
          {!live ? (
            <DashLeeg>No MT5 demo linked. Link a new demo account in the Desk and its positions show up here.</DashLeeg>
          ) : posities.length === 0 ? (
            <DashLeeg>No open positions.</DashLeeg>
          ) : (
            posities.map((p, i) => (
              <div key={`${p.symbol}-${i}`} className="axe-dash-regel">
                <b>{p.symbol}</b>
                <span className="mono">{p.side} {p.volume}</span>
                <span className="mono" style={{ color: p.profit == null ? undefined : p.profit >= 0 ? 'var(--success)' : 'var(--error)' }}>
                  {p.profit == null ? '—' : p.profit.toFixed(2)}
                </span>
              </div>
            ))
          )}
        </DashKaart>
      }
      /* 17 nov, UI-ronde: de tegels zeiden alleen "EX"/"DOCS"/"STAGE" en een
         naam. Nu staat er wat erachter zit, en een label dat je kunt lezen.
         25 nov: 'Risk' (ging ook naar de Desk) is de live Posities-kaart geworden. */
      tiles={[
        { id: 'desk', label: 'Desk', note: 'Trading Desk · positions, risk and demo orders', badge: 'demo', badgeTone: 'ex', path: '/trading-desk' },
        { id: 'intel', label: 'Intel', note: 'Trading Intel · market, signals, news', badge: 'demo', badgeTone: 'ex', path: '/trading-intel' },
        { id: 'memory', label: 'Memory', note: 'Trading Memory · lessons and notes', badge: 'notes', badgeTone: 'docs', path: '/memory/trading' },
        { id: 'pnl', label: 'PnL', note: 'Profit and loss · demo account', badge: 'demo', badgeTone: 'ex', path: '/trading-intel' },
        { id: 'watch', label: 'Watch', note: 'Watchlist · in Intel', badge: 'in progress', badgeTone: 'stage', path: '/trading-intel' },
      ]}
    />
  );
}
