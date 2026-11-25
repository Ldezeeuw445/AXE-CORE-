import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router';
import { DashSchil, DashKop, DashKaart, DashLeeg } from '@/presentation/components/layout/dashboardSchil';
import { ActieKnop, Kpi, KpiRij } from '@/presentation/components/layout/KpiTegels';
import { useAxeAlgoAccountSnapshot } from '@/presentation/hooks/useAxeAlgoAccountSnapshot';
import { listTrades } from '@/infrastructure/persistence/tradingTradesService';
import { getCircuitBreakerState } from '@/infrastructure/persistence/tradingCircuitBreakerService';
import type { CircuitBreakerState } from '@/domain/tradingIntel/botTypes';
import { geledenKort, perStrategie, pnlCurve, pnlPerDag, terugvalPct, winRate, type HubTrade } from '@/domain/tradingIntel/hubKpi';
import './tradingHub.css';

/**
 * Trading-hub als dashboard (25 nov, Luka: KPI's, grafiekjes, acties). Demo
 * only: geen order-knoppen hier, ook niet voor demo -- die staan in de Desk.
 *
 * Bronnen: de MT5-demo via useAxeAlgoAccountSnapshot (alleen een gekoppelde
 * demo telt als equity; het papieraccount van de app is geen rekening van
 * Luka) en core_trading_trades voor alles wat gesloten is. Geen data = "—"
 * met de reden, nooit een verzonnen getal of lijn.
 */
function geld(n: number | null | undefined, cur?: string | null, teken = false): string {
  if (n == null || !Number.isFinite(n)) return '—';
  const s = Math.abs(n).toLocaleString('en-GB', { maximumFractionDigits: 0 });
  const voor = teken ? (n >= 0 ? '+' : '−') : n < 0 ? '−' : '';
  return `${voor}${cur ? `${cur} ` : ''}${s}`;
}

function datumKort(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
}

/** De P&L-lijn als grafiek: vlak, nul-lijn, min/max en de eerste en laatste datum. */
function Curve({ punten }: { punten: Array<{ t: string; v: number }> }) {
  const b = 600; const h = 160;
  const vs = punten.map((p) => p.v);
  const min = Math.min(0, ...vs); const max = Math.max(0, ...vs);
  const span = max - min || 1;
  const y = (v: number) => h - 6 - ((v - min) / span) * (h - 12);
  const pad = punten.map((p, i) => `${i ? 'L' : 'M'}${((i / Math.max(1, punten.length - 1)) * b).toFixed(1)},${y(p.v).toFixed(1)}`).join(' ');
  const laatst = vs[vs.length - 1];
  return (
    <div className="axe-th-curve">
      <svg viewBox={`0 0 ${b} ${h}`} preserveAspectRatio="none" aria-label="Cumulative P&L of closed trades" data-toon={laatst >= 0 ? 'ok' : 'fout'}>
        <line x1="0" x2={b} y1={y(0)} y2={y(0)} className="axe-th-nul" />
        <path d={`${pad} L${b},${y(0)} L0,${y(0)} Z`} className="axe-th-vlak" />
        <path d={pad} className="axe-th-lijn" />
      </svg>
      <span className="axe-th-as axe-th-as--max">{geld(max)}</span>
      <span className="axe-th-as axe-th-as--min">{geld(min)}</span>
      <span className="axe-th-as axe-th-as--van">{datumKort(punten[0].t)}</span>
      <span className="axe-th-as axe-th-as--tot">{datumKort(punten[punten.length - 1].t)}</span>
    </div>
  );
}

/** Staafjes per sluitdag: groen boven nul, rood eronder. */
function Staven({ dagen }: { dagen: Array<{ dag: string; pnl: number; trades: number }> }) {
  const max = Math.max(1, ...dagen.map((d) => Math.abs(d.pnl)));
  return (
    <div className="axe-th-staven" data-axe-th-staven>
      {dagen.map((d) => (
        <div key={d.dag} className="axe-th-staaf" title={`${datumKort(d.dag)} · ${geld(d.pnl, null, true)} · ${d.trades} trades`}>
          <span className="axe-th-staaf-boven">{d.pnl > 0 && <i style={{ height: `${(d.pnl / max) * 100}%` }} />}</span>
          <span className="axe-th-staaf-onder">{d.pnl < 0 && <i style={{ height: `${(-d.pnl / max) * 100}%` }} />}</span>
        </div>
      ))}
    </div>
  );
}

export default function TradingDemoHub() {
  const navigate = useNavigate();
  const snap = useAxeAlgoAccountSnapshot();
  const [trades, setTrades] = useState<HubTrade[] | null>(null);
  const [fout, setFout] = useState<string | null>(null);
  const [rem, setRem] = useState<CircuitBreakerState | null | undefined>(undefined);

  useEffect(() => {
    let weg = false;
    const laad = () => {
      listTrades({ limit: 500 }).then((r) => { if (!weg) { setTrades(r); setFout(null); } }).catch((e) => { if (!weg) setFout(String(e)); });
      getCircuitBreakerState().then((s) => { if (!weg) setRem(s); }).catch(() => { if (!weg) setRem(null); });
    };
    laad();
    const t = window.setInterval(() => { if (!document.hidden) laad(); }, 120_000);
    return () => { weg = true; window.clearInterval(t); };
  }, []);

  const live = snap.isReal;
  const posities = live ? snap.positions : [];
  const openPnl = live ? posities.reduce((s, p) => s + (p.profit ?? 0), 0) : null;
  const geenKoppeling = snap.loading ? 'Loading…' : 'No MT5 demo linked';
  const curve = trades ? pnlCurve(trades) : [];
  const totaal = curve.length ? curve[curve.length - 1].v : null;
  const winst = trades ? winRate(trades) : null;
  const dagen = trades ? pnlPerDag(trades) : [];
  const strategieen = trades ? perStrategie(trades) : [];
  const recent = trades ? curveRecent(trades) : [];
  const journaalOpen = trades ? trades.filter((t) => t.status === 'open') : [];
  const laatsteSluit = curve.length ? curve[curve.length - 1].t : null;
  const terugval = live ? terugvalPct(rem?.peakEquity, snap.equity) : null;
  const laden = trades == null && !fout;

  return (
    <DashSchil tab="trading" kop={
      <DashKop titel="Trading" sub="Demo hub · no live orders" acties={
        <>
          <ActieKnop onKlik={() => navigate('/trading-desk')} titel="Positions, risk and demo orders">Open Desk</ActieKnop>
          <ActieKnop onKlik={() => navigate('/trading-intel')} titel="Market, signals, news">Intel</ActieKnop>
          <ActieKnop onKlik={() => navigate('/memory/trading')} titel="Lessons and notes">Journal</ActieKnop>
        </>
      } />
    }>
      <KpiRij kolommen={6}>
        <Kpi label="Account" waarde={live ? 'MT5 demo' : '—'} toon={live ? 'ok' : 'uit'}
          regel={live ? `${snap.currency ?? ''} · linked via MetaAPI`.trim() : geenKoppeling} onKlik={() => navigate('/trading-desk')} />
        <Kpi label="Equity" waarde={live ? geld(snap.equity, snap.currency) : '—'} toon={live ? 'ok' : 'uit'}
          regel={live ? 'MetaAPI, live read' : geenKoppeling} onKlik={() => navigate('/trading-desk')} />
        <Kpi label="Open P&L" waarde={openPnl == null ? '—' : geld(openPnl, snap.currency, true)}
          toon={openPnl == null ? 'uit' : openPnl >= 0 ? 'ok' : 'fout'}
          regel={live ? `${posities.length} open ${posities.length === 1 ? 'position' : 'positions'}` : geenKoppeling} onKlik={() => navigate('/trading-desk')} />
        <Kpi label="Closed P&L" waarde={totaal == null ? '—' : geld(totaal, null, true)} toon={totaal == null ? 'uit' : totaal >= 0 ? 'ok' : 'fout'}
          spark={curve.length > 1 ? curve.slice(-40).map((p) => p.v) : undefined}
          regel={laden ? 'Loading trades…' : fout ? 'Trades did not load' : curve.length ? `${curve.length} closed · last ${geledenKort(laatsteSluit)}` : 'No closed trades yet'}
          onKlik={() => navigate('/trading-intel')} />
        <Kpi label="Win rate" waarde={winst ? `${winst.pct}%` : '—'} toon={!winst ? 'uit' : winst.pct >= 50 ? 'ok' : 'let-op'}
          regel={winst ? `last ${winst.n} closed trades` : 'No closed trades yet'} onKlik={() => navigate('/trading-intel')} />
        <Kpi label="Circuit breaker" waarde={!rem ? '—' : rem.tripped ? 'Tripped' : terugval != null ? `${terugval}%` : 'Armed'}
          toon={!rem ? 'uit' : rem.tripped ? 'fout' : terugval != null && terugval >= 5 ? 'let-op' : 'ok'}
          regel={rem === undefined ? 'Loading…' : rem?.tripped ? (rem.trippedReason || 'Trading paused') : terugval != null ? 'drawdown from peak equity' : rem ? 'not tripped · no live equity to compare' : 'not set up yet'}
          onKlik={() => navigate('/trading-desk')} />
      </KpiRij>

      <div className="axe-th-raster" data-axe-th-raster>
        <DashKaart titel="P&L curve · closed trades" telling={curve.length || undefined} kolom={2} className="axe-th-kaart axe-th-kaart--curve" vrij
          actie={<ActieKnop onKlik={() => navigate('/trading-intel')}>Scorecard</ActieKnop>}>
          {curve.length > 1 ? <Curve punten={curve} /> : (
            <DashLeeg>{laden ? 'Loading trades…' : fout ? `Trades did not load: ${fout}` : 'No closed trades yet, so no curve. It fills in as trades close.'}</DashLeeg>
          )}
        </DashKaart>
        <DashKaart titel="Open positions" telling={(live ? posities.length : journaalOpen.length) || undefined} className="axe-th-kaart" vrij
          actie={<ActieKnop onKlik={() => navigate('/trading-desk')}>Manage</ActieKnop>}>
          <div className="axe-th-lijst">
            {live && posities.length === 0 && <DashLeeg>No open positions on the MT5 demo.</DashLeeg>}
            {live && posities.slice(0, 6).map((p, i) => (
              <div key={`${p.symbol}-${i}`} className="axe-th-regel">
                <b>{p.symbol}</b><span>{p.side} {p.volume}</span>
                <span className="axe-th-getal" data-toon={p.profit == null ? undefined : p.profit >= 0 ? 'ok' : 'fout'}>{p.profit == null ? '—' : p.profit.toFixed(2)}</span>
              </div>
            ))}
            {!live && journaalOpen.length === 0 && <DashLeeg>{laden ? 'Loading…' : 'No MT5 demo linked and no open trades in the journal.'}</DashLeeg>}
            {!live && journaalOpen.slice(0, 5).map((t, i) => (
              <div key={`${t.symbol}-${i}`} className="axe-th-regel">
                <b>{t.symbol}</b><span>{t.side} · {t.venue}</span><span className="axe-th-sub">opened {geledenKort(t.opened_at)}</span>
              </div>
            ))}
            {!live && journaalOpen.length > 0 && <p className="axe-th-noot">From the trade journal; link the MT5 demo for live P&L.</p>}
          </div>
        </DashKaart>
        <DashKaart titel="P&L per day" telling={dagen.length || undefined} className="axe-th-kaart" vrij>
          {dagen.length ? (
            <div className="axe-th-dagen">
              <Staven dagen={dagen} />
              <span className="axe-th-noot">last {dagen.length} days with a close · {datumKort(dagen[0].dag)} – {datumKort(dagen[dagen.length - 1].dag)}</span>
            </div>
          ) : <DashLeeg>{laden ? 'Loading…' : 'No closed trades yet.'}</DashLeeg>}
        </DashKaart>
        <DashKaart titel="Recent closed trades" className="axe-th-kaart" vrij
          actie={<ActieKnop onKlik={() => navigate('/memory/trading')}>Journal</ActieKnop>}>
          <div className="axe-th-lijst">
            {recent.length === 0 && <DashLeeg>{laden ? 'Loading…' : 'No closed trades yet.'}</DashLeeg>}
            {recent.map((t, i) => (
              <div key={`${t.symbol}-${t.closed_at}-${i}`} className="axe-th-regel">
                <b>{t.symbol}</b><span>{t.side} · {datumKort(t.closed_at!)}</span>
                <span className="axe-th-getal" data-toon={(t.pnl as number) >= 0 ? 'ok' : 'fout'}>{geld(t.pnl, null, true)}</span>
              </div>
            ))}
          </div>
        </DashKaart>
        <DashKaart titel="By strategy" telling={strategieen.length || undefined} className="axe-th-kaart" vrij>
          <div className="axe-th-lijst">
            {strategieen.length === 0 && <DashLeeg>{laden ? 'Loading…' : 'No closed trades yet.'}</DashLeeg>}
            {strategieen.map((s) => (
              <div key={s.naam} className="axe-th-regel">
                <b title={s.naam}>{s.naam}</b><span>{s.n} trades</span>
                <span className="axe-th-getal" data-toon={s.pnl >= 0 ? 'ok' : 'fout'}>{geld(s.pnl, null, true)}</span>
              </div>
            ))}
          </div>
        </DashKaart>
      </div>
    </DashSchil>
  );
}

/** De laatste gesloten trades, nieuwste eerst. */
function curveRecent(trades: readonly HubTrade[], max = 6): HubTrade[] {
  return trades
    .filter((t) => t.status === 'closed' && t.closed_at && typeof t.pnl === 'number')
    .sort((a, b) => Date.parse(b.closed_at!) - Date.parse(a.closed_at!))
    .slice(0, max);
}
