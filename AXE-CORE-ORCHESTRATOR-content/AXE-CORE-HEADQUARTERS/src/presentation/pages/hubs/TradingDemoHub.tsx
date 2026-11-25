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
  const geenKoppeling = snap.loading ? 'laden…' : 'geen MT5-demo gekoppeld';

  return (
    <HubV3
      tab="trading"
      title="Trading"
      sub="Demo hub · geen live orders"
      cijfers={[
        { label: 'Account', waarde: live ? 'MT5' : '—', sub: live ? 'demo gekoppeld' : geenKoppeling, toon: live ? 'ok' : undefined },
        { label: 'Equity', waarde: live ? geld(snap.equity, snap.currency) : '—', sub: live ? 'MetaAPI' : geenKoppeling },
        { label: 'Open posities', waarde: live ? posities.length : '—', sub: live ? (posities[0]?.symbol ?? 'geen open posities') : geenKoppeling },
        { label: 'Open P&L', waarde: openPnl == null ? '—' : geld(openPnl, snap.currency),
          toon: openPnl == null ? undefined : openPnl >= 0 ? 'ok' : 'fout', sub: live ? 'som van open posities' : geenKoppeling },
      ]}
      kaartVakken={1}
      kaarten={
        <DashKaart titel="Posities" telling={live ? posities.length : undefined}>
          {!live ? (
            <DashLeeg>Geen MT5-demo gekoppeld. Koppel een nieuw demo-account in de Desk; dan staan de posities hier.</DashLeeg>
          ) : posities.length === 0 ? (
            <DashLeeg>Geen open posities.</DashLeeg>
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
        { id: 'desk', label: 'Desk', note: 'Trading Desk · posities, risico en demo-orders', badge: 'demo', badgeTone: 'ex', path: '/trading-desk' },
        { id: 'intel', label: 'Intel', note: 'Trading Intel · markt, signalen, nieuws', badge: 'demo', badgeTone: 'ex', path: '/trading-intel' },
        { id: 'memory', label: 'Memory', note: 'Trading Memory · lessen en notities', badge: 'notities', badgeTone: 'docs', path: '/memory/trading' },
        { id: 'pnl', label: 'PnL', note: 'Winst en verlies · demo-account', badge: 'demo', badgeTone: 'ex', path: '/trading-intel' },
        { id: 'watch', label: 'Watch', note: 'Watchlist · in Intel', badge: 'in opbouw', badgeTone: 'stage', path: '/trading-intel' },
      ]}
    />
  );
}
