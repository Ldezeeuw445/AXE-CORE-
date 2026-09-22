/**
 * StrategyLabPanel — een realistische test in de Backtest-tab: saldo, sizing,
 * kosten, stops, en optioneel de regels van een account (funded-simulator).
 *
 * De strategie, het symbool, de timeframe en het aantal bars komen van de tab
 * zelf, zodat de signaaltest en de lab-test altijd over hetzelfde gaan.
 */
import { useEffect, useMemo, useState } from 'react';
import { WidgetCard } from '@/presentation/components/widgets/WidgetCard';
import { getAccounts, type TradingAccount } from '@/infrastructure/persistence/tradingAccountsService';
import { getRiskProfile } from '@/infrastructure/persistence/tradingRiskService';
import type { RiskProfile } from '@/domain/tradingIntel/botTypes';
import { applyRiskEdit } from '@/domain/tradingIntel/riskPresets';
import {
  deleteLabRun, getSavedLabRuns, runStrategyLab, saveLabRun,
  type LabStrategy, type SavedLabRun, type StrategyLabResult,
} from '@/application/tradingIntel/strategyLab';
import { AccountRulesFields } from '../AccountRulesFields';
import { LabEquityChart } from './LabEquityChart';
import { LabTradeTable } from './LabTradeTable';
import { LabReplay } from './LabReplay';
import { StrategyMatrix } from './StrategyMatrix';

const INPUT = 'rounded px-2 py-1.5 text-[12px] w-full';
const INPUT_STYLE = { background: 'var(--bg-surface)', border: '1px solid rgba(255,255,255,0.1)', color: '#F5F0E6' } as const;
const DIM = { color: 'rgba(255,255,255,0.4)' } as const;

function Num({ label, value, onChange, step = 'any', hint }: { label: string; value: number; onChange: (v: number) => void; step?: string; hint?: string }) {
  return (
    <label className="grid gap-1">
      <span className="text-[10px] uppercase tracking-wide" style={DIM}>{label}</span>
      <input type="number" step={step} value={Number.isFinite(value) ? value : ''} onChange={e => onChange(parseFloat(e.target.value))} className={INPUT} style={INPUT_STYLE} />
      {hint && <span className="text-[9px]" style={{ color: 'rgba(255,255,255,0.28)' }}>{hint}</span>}
    </label>
  );
}

const CUSTOM_BASE: RiskProfile = {
  mode: 'custom', riskPerTradePct: 0.01, maxOpenRiskPct: 0.05, maxDailyLossPct: 0.05, maxTradesPerDay: 20,
  minConfidence: 0.5, allowShort: true, maxDrawdownPct: 0.1, drawdownType: 'static', initialBalance: 100_000,
  profitTargetPct: 0.08, resetTimezone: 'UTC', updatedAt: '',
};

export function StrategyLabPanel({ symbol, timeframe, limit, strategy }: {
  symbol: string; timeframe: string; limit: number; strategy: LabStrategy | null;
}) {
  const [startingBalance, setStartingBalance] = useState(100_000);
  const [sizingMode, setSizingMode] = useState<'risk' | 'fixed'>('risk');
  const [riskPct, setRiskPct] = useState(1);
  const [lots, setLots] = useState(0.1);
  const [spread, setSpread] = useState(0);
  const [commission, setCommission] = useState(0);
  const [slippage, setSlippage] = useState(0);
  const [maxConcurrent, setMaxConcurrent] = useState(1);
  const [maxTradesPerDay, setMaxTradesPerDay] = useState(0);
  const [rewardRisk, setRewardRisk] = useState(1.5);
  const [atrMultiple, setAtrMultiple] = useState(1.5);
  const [allowShort, setAllowShort] = useState(true);
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [profileSource, setProfileSource] = useState<'none' | 'custom' | string>('none');
  const [customProfile, setCustomProfile] = useState<RiskProfile>(CUSTOM_BASE);
  const [accounts, setAccounts] = useState<TradingAccount[]>([]);
  const [accountProfiles, setAccountProfiles] = useState<Record<string, RiskProfile>>({});
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<StrategyLabResult | SavedLabRun | null>(null);
  const [saved, setSaved] = useState<SavedLabRun[]>([]);
  const [note, setNote] = useState('');
  const [replayOpen, setReplayOpen] = useState(false);

  useEffect(() => {
    void getAccounts().then(s => setAccounts(s.accounts)).catch(() => undefined);
    void getSavedLabRuns().then(setSaved).catch(() => undefined);
  }, []);

  useEffect(() => {
    if (profileSource === 'none' || profileSource === 'custom') return;
    let alive = true;
    void getRiskProfile(profileSource)
      .then(p => { if (alive) setAccountProfiles(m => ({ ...m, [profileSource]: p })); })
      .catch(() => undefined);
    return () => { alive = false; };
  }, [profileSource]);

  const profile: RiskProfile | null = profileSource === 'none' ? null
    : profileSource === 'custom' ? customProfile : (accountProfiles[profileSource] ?? null);
  const profileLabel = profileSource === 'none' ? null : profileSource === 'custom' ? 'custom rules'
    : `${accounts.find(a => a.accountId === profileSource)?.label ?? profileSource.slice(0, 8)} rules`;

  // Eén bron voor de instellingen: de enkele run en de matrix gebruiken dezelfde.
  const baseConfig = () => ({
    limit,
    from: from ? new Date(`${from}T00:00:00Z`).toISOString() : null,
    to: to ? new Date(`${to}T23:59:59Z`).toISOString() : null,
    startingBalance,
    sizing: sizingMode === 'fixed' ? { mode: 'fixed' as const, lots } : { mode: 'risk' as const, riskPct: riskPct / 100 },
    costs: { spread, commissionPerLot: commission, slippage },
    maxConcurrent, maxTradesPerDay: maxTradesPerDay > 0 ? maxTradesPerDay : null,
    rewardRisk: rewardRisk > 0 ? rewardRisk : null, atrMultiple, allowShort,
    profile, profileLabel,
  });

  const run = async () => {
    if (!strategy) return;
    setRunning(true); setError(null);
    try {
      const res = await runStrategyLab({ ...baseConfig(), symbol, timeframe, strategy });
      if (res.ok) setResult(res.result); else setError(res.error);
    } finally {
      setRunning(false);
    }
  };

  const view = useMemo(() => {
    if (!result) return null;
    if ('run' in result) return { meta: result.meta, metrics: result.run.metrics, trades: result.run.trades, equity: result.run.equity, events: result.run.events, funded: result.run.funded };
    return { meta: result.meta, metrics: result.metrics, trades: result.trades, equity: result.equity, events: result.events, funded: result.funded };
  }, [result]);

  return (
    <WidgetCard title={`Strategy Lab — account simulation on ${symbol}`}>
      <p className="text-[10px] mb-3" style={DIM}>
        Same signal as live, filled like a market order on the next bar, with a real stop and target, costs and position sizing.
        Pick an account's rules to simulate a funded challenge.
      </p>
      <div className="grid gap-2.5 [grid-template-columns:repeat(auto-fill,minmax(130px,1fr))]">
        <Num label="Starting balance" value={startingBalance} onChange={setStartingBalance} step="100" />
        <label className="grid gap-1">
          <span className="text-[10px] uppercase tracking-wide" style={DIM}>Sizing</span>
          <select value={sizingMode} onChange={e => setSizingMode(e.target.value as 'risk' | 'fixed')} className={INPUT} style={INPUT_STYLE}>
            <option value="risk">Risk % at stop</option>
            <option value="fixed">Fixed lots</option>
          </select>
        </label>
        {sizingMode === 'risk'
          ? <Num label="Risk %" value={riskPct} onChange={setRiskPct} step="0.05" hint="money lost at the stop" />
          : <Num label="Lots" value={lots} onChange={setLots} step="0.01" />}
        <Num label="Stop (× ATR)" value={atrMultiple} onChange={setAtrMultiple} step="0.1" hint="live uses 1.5" />
        <Num label="Target (R)" value={rewardRisk} onChange={setRewardRisk} step="0.1" hint="0 = no target" />
        <Num label="Spread (price)" value={spread} onChange={setSpread} step="0.00001" />
        <Num label="Commission / lot / side" value={commission} onChange={setCommission} step="0.5" />
        <Num label="Slippage (price)" value={slippage} onChange={setSlippage} step="0.00001" />
        <Num label="Max positions" value={maxConcurrent} onChange={v => setMaxConcurrent(Math.max(1, Math.round(v || 1)))} step="1" />
        <Num label="Max trades / day" value={maxTradesPerDay} onChange={v => setMaxTradesPerDay(Math.max(0, Math.round(v || 0)))} step="1" hint="0 = no limit" />
        <label className="grid gap-1">
          <span className="text-[10px] uppercase tracking-wide" style={DIM}>From</span>
          <input type="date" value={from} onChange={e => setFrom(e.target.value)} className={INPUT} style={INPUT_STYLE} />
        </label>
        <label className="grid gap-1">
          <span className="text-[10px] uppercase tracking-wide" style={DIM}>To</span>
          <input type="date" value={to} onChange={e => setTo(e.target.value)} className={INPUT} style={INPUT_STYLE} />
        </label>
        <label className="grid gap-1">
          <span className="text-[10px] uppercase tracking-wide" style={DIM}>Account rules</span>
          <select value={profileSource} onChange={e => setProfileSource(e.target.value)} className={INPUT} style={INPUT_STYLE}>
            <option value="none">None (plain account)</option>
            <option value="custom">Custom rules…</option>
            {accounts.map(a => <option key={a.id} value={a.accountId}>{a.label}</option>)}
          </select>
        </label>
        <label className="flex items-center gap-2 self-end pb-1.5">
          <input type="checkbox" checked={allowShort} onChange={e => setAllowShort(e.target.checked)} />
          <span className="text-[11px]" style={{ color: 'rgba(255,255,255,0.6)' }}>Allow short</span>
        </label>
      </div>

      {profileSource === 'custom' && (
        <AccountRulesFields key="lab-custom" risk={customProfile} commit={patch => setCustomProfile(p => applyRiskEdit(p, patch))} />
      )}
      {profile && (
        <p className="text-[10px] mt-2" style={DIM}>
          Rules: daily loss {(profile.maxDailyLossPct * 100).toFixed(1)}% · max DD {((profile.maxDrawdownPct ?? 0) * 100).toFixed(1)}% {profile.drawdownType ?? 'trailing'}
          {profile.profitTargetPct ? ` · target ${(profile.profitTargetPct * 100).toFixed(1)}%` : ''}
          {profile.minTradingDays ? ` · min ${profile.minTradingDays} days` : ''}
          {profile.consistencyPct ? ` · consistency ${(profile.consistencyPct * 100).toFixed(0)}%` : ''}
          {' · '}reset {profile.resetTimezone ?? 'UTC'}
        </p>
      )}

      <div className="flex items-center gap-2 mt-3">
        <button
          type="button" disabled={running || !strategy} onClick={() => void run()}
          className="px-4 py-2 rounded-lg text-[12px] disabled:opacity-40"
          style={{ border: '1px solid rgba(167,139,250,0.3)', color: '#c4b5fd' }}
        >
          {running ? 'Simulating…' : `Simulate ${timeframe} · ${limit.toLocaleString()} bars`}
        </button>
        {!strategy && <span className="text-[10px]" style={DIM}>Crew Hybrid needs live intel — pick a backtestable strategy.</span>}
        {error && <span className="text-[11px]" style={{ color: '#fca5a5' }}>{error}</span>}
      </div>

      {view && (
        <div className="mt-4 space-y-3">
          {view.funded && (
            <div className="text-[12px] font-mono-data">
              <span style={{ color: view.funded.status === 'PASS' ? '#6ee7b7' : view.funded.status === 'BREACHED' ? '#fca5a5' : '#fcd34d' }}>
                {view.funded.status}
              </span>
              {view.funded.event && (
                <span style={{ color: 'rgba(255,255,255,0.6)' }}>
                  {' '}· {view.funded.event.time.slice(0, 16).replace('T', ' ')} · rule {view.funded.event.rule}
                  {view.funded.event.tradeId != null ? ` · trade #${view.funded.event.tradeId}` : ''}
                  {' '}· equity {view.funded.event.equity.toFixed(2)} · balance {view.funded.event.balance.toFixed(2)}
                  {' '}· DD {(view.funded.event.drawdownPct * 100).toFixed(2)}% — {view.funded.event.detail}
                </span>
              )}
            </div>
          )}
          <div className="grid gap-2 [grid-template-columns:repeat(auto-fill,minmax(150px,1fr))]">
            {[
              { label: 'Net profit', value: `${view.metrics.netProfit >= 0 ? '+' : ''}${view.metrics.netProfit.toFixed(2)} ${view.meta.pnlCurrency}`, color: view.metrics.netProfit >= 0 ? '#6ee7b7' : '#fca5a5' },
              { label: 'Return', value: `${(view.metrics.netReturnPct * 100).toFixed(2)}%`, color: view.metrics.netReturnPct >= 0 ? '#6ee7b7' : '#fca5a5' },
              { label: 'Trades', value: String(view.metrics.totalTrades), color: view.metrics.totalTrades < 30 ? '#fcd34d' : undefined },
              { label: 'Win rate', value: `${(view.metrics.winRate * 100).toFixed(0)}%` },
              { label: 'Profit factor', value: Number.isFinite(view.metrics.profitFactor) ? view.metrics.profitFactor.toFixed(2) : '∞' },
              { label: 'Avg R', value: view.metrics.avgR.toFixed(2) },
              { label: 'Max drawdown', value: `${(view.metrics.maxDrawdownPct * 100).toFixed(2)}%`, color: '#fca5a5' },
              { label: 'Max loss streak', value: String(view.metrics.maxConsecutiveLosses) },
              { label: 'Commission', value: view.metrics.commissionPaid.toFixed(2) },
              { label: 'Time in market', value: `${(view.metrics.exposurePct * 100).toFixed(0)}%` },
            ].map(t => (
              <div key={t.label}>
                <div className="text-[9px] uppercase tracking-wider" style={{ color: 'rgba(255,255,255,0.35)' }}>{t.label}</div>
                <div className="text-[14px] font-mono-data mt-0.5" style={{ color: t.color || '#F5F0E6' }}>{t.value}</div>
              </div>
            ))}
          </div>
          <LabEquityChart points={view.equity} events={view.events} startingBalance={view.meta.startingBalance} />
          <p className="text-[10px] leading-snug" style={DIM}>
            {view.meta.strategyLabel} · {view.meta.symbol} {view.meta.timeframe} · {view.meta.from?.slice(0, 10)} → {view.meta.to?.slice(0, 10)} · {view.meta.bars} bars ({view.meta.source})
            {' · '}instrument {view.meta.instrumentSource} · sizing {view.meta.sizing.mode === 'fixed' ? `${view.meta.sizing.lots} lots` : `${((view.meta.sizing.riskPct) * 100).toFixed(2)}% at stop`}
            {' · '}stop {view.meta.stop.atrMultiple}×ATR, target {view.meta.stop.rewardRisk ?? 'none'}R
            {' · '}spread {view.meta.costs.spread} · commission {view.meta.costs.commissionPerLot}/lot/side · slippage {view.meta.costs.slippage}
            {view.meta.profileLabel ? ` · ${view.meta.profileLabel}` : ''}
            {view.meta.history ? <><br />History: {view.meta.history}</> : null}
          </p>
          {Object.keys(view.metrics.blockedByRule).length > 0 && (
            <p className="text-[10px]" style={DIM}>
              Signals not taken: {Object.entries(view.metrics.blockedByRule).map(([k, v]) => `${k} ×${v}`).join(' · ')}
            </p>
          )}
          {view.meta.warnings.length > 0 && (
            <ul className="text-[10px] space-y-0.5" style={{ color: '#fcd34d' }}>
              {view.meta.warnings.map(w => <li key={w}>⚠ {w}</li>)}
            </ul>
          )}
          <div className="flex items-center gap-2">
            <button type="button" onClick={() => setReplayOpen(o => !o)} className="px-3 py-1.5 rounded text-[11px]"
              style={{ border: '1px solid rgba(167,139,250,0.3)', color: '#c4b5fd' }}>
              {replayOpen ? 'Hide replay' : 'Replay this run on the chart'}
            </button>
            <span className="text-[10px]" style={DIM}>Step bar by bar; indicators only ever see the bars up to the cursor.</span>
          </div>
          {replayOpen && (
            <LabReplay
              symbol={view.meta.symbol}
              timeframe={view.meta.timeframe}
              from={view.meta.from}
              to={view.meta.to}
              strategy={view.meta.strategyLabel.startsWith('combo') ? null : view.meta.strategyLabel}
              trades={view.trades}
              equity={view.equity}
              onClose={() => setReplayOpen(false)}
            />
          )}
          <LabTradeTable trades={view.trades} currency={view.meta.pnlCurrency} />
          {'run' in (result as object) && (
            <div className="flex items-center gap-2">
              <input value={note} onChange={e => setNote(e.target.value)} placeholder="Optional note" className="flex-1 rounded px-2 py-1.5 text-[11px]" style={INPUT_STYLE} />
              <button type="button"
                onClick={() => { void saveLabRun(result as StrategyLabResult, note || undefined).then(setSaved); setNote(''); }}
                className="px-3 py-1.5 rounded text-[11px]" style={{ color: '#6ee7b7', border: '1px solid rgba(52,211,153,0.3)' }}>
                Save this run
              </button>
            </div>
          )}
        </div>
      )}

      <StrategyMatrix base={baseConfig} />

      {saved.length > 0 && (
        <div className="mt-4 pt-3 space-y-1" style={{ borderTop: '1px solid rgba(255,255,255,0.06)' }}>
          <p className="text-[10px] uppercase tracking-wider" style={{ color: 'rgba(255,255,255,0.35)' }}>Saved lab runs</p>
          {saved.map(s => (
            <div key={s.id} className="flex items-center gap-2 text-[11px]">
              <button type="button" onClick={() => setResult(s)} className="flex-1 text-left truncate" style={{ color: '#F5F0E6' }}>
                {s.meta.strategyLabel} · {s.meta.symbol} {s.meta.timeframe} · {s.metrics.totalTrades} trades ·{' '}
                <span style={{ color: s.metrics.netProfit >= 0 ? '#6ee7b7' : '#fca5a5' }}>{(s.metrics.netReturnPct * 100).toFixed(1)}%</span>
                {s.funded ? ` · ${s.funded.status}` : ''}{s.note ? ` — ${s.note}` : ''} · {s.savedAt.slice(0, 10)}
              </button>
              <button type="button" onClick={() => void deleteLabRun(s.id).then(setSaved)} className="text-[10px]" style={{ color: 'var(--error)' }}>Delete</button>
            </div>
          ))}
        </div>
      )}
    </WidgetCard>
  );
}

