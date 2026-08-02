/**
 * Trading Intel — research, live chart, self-improving demo agent, MetaAPI MT5.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { Bot, LineChart, Loader2, Play, Radar, RefreshCw, Sparkles } from 'lucide-react';
import { WidgetCard } from '@/presentation/components/widgets/WidgetCard';
import { CompanionStyleChart, type IndicatorSnapshot } from '@/presentation/components/trading/CompanionStyleChart';
import { SIGNAL_META, type TradingIntelReport, type TradingSignal } from '@/domain/tradingIntel/types';
import { createEmptyReport, deleteIntelReport, listIntelReports, listWatchlist, summarizeIntel, upsertIntelReport } from '@/infrastructure/persistence/tradingIntelService';
import { runTradingResearch } from '@/application/tradingIntel/runTradingResearch';
import { isAxeApiConfigured, flowRun } from '@/infrastructure/gateways/axeCoreApiService';
import { fetchMarketSnapshot, rsi, sma } from '@/infrastructure/gateways/marketDataService';
import type { MarketSnapshot, DemoAccount } from '@/domain/tradingIntel/demoTypes';
import { equity, getDemoAccount, resetDemoAccount, unrealizedPnl } from '@/infrastructure/persistence/demoTradingService';
import { runTradingAgent } from '@/application/tradingIntel/tradingAgentEngine';
import { loadTradingAgentMemory } from '@/infrastructure/persistence/tradingAgentMemoryService';
import type { GlobalMemoryEntry } from '@/infrastructure/persistence/globalMemoryService';
import { getRiskProfile, setRiskMode } from '@/infrastructure/persistence/tradingRiskService';
import { getLearningStats } from '@/infrastructure/persistence/tradingLearningService';
import { getBrokerConnection, connectBrokerKind } from '@/infrastructure/gateways/brokerConnector';
import { getMetaApiConfig, saveMetaApiConfig, metaApiGetAccount, type MetaApiRegion } from '@/infrastructure/gateways/metaApiService';
import type { RiskProfile, RiskMode, ThinkingTrace, AgentLearningStats, BrokerConnection } from '@/domain/tradingIntel/botTypes';
import { toast } from 'sonner';

type TabId = 'desk' | 'intel' | 'agent' | 'demo';

function Badge({ signal }: { signal: TradingSignal }) {
  const m = SIGNAL_META[signal];
  return <span className="text-[10px] px-2 py-0.5 rounded-full" style={{ color: m.color, background: m.bg }}>{m.label}</span>;
}

export default function TradingIntel() {
  const [tab, setTab] = useState<TabId>('desk');
  const [indicatorSnap, setIndicatorSnap] = useState<IndicatorSnapshot | null>(null);
  const [reports, setReports] = useState<TradingIntelReport[]>([]);
  const [watchCount, setWatchCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const [running, setRunning] = useState(false);
  const [deepRunning, setDeepRunning] = useState(false);
  const [agentRunning, setAgentRunning] = useState(false);
  const [symbol, setSymbol] = useState('XAUUSD');
  const [chartSymbol, setChartSymbol] = useState('XAUUSD');
  const [account, setAccount] = useState<DemoAccount | null>(null);
  const [snapshot, setSnapshot] = useState<MarketSnapshot | null>(null);
  const [memory, setMemory] = useState<GlobalMemoryEntry[]>([]);
  const [risk, setRisk] = useState<RiskProfile | null>(null);
  const [learning, setLearning] = useState<AgentLearningStats | null>(null);
  const [broker, setBroker] = useState<BrokerConnection | null>(null);
  const [lastTrace, setLastTrace] = useState<ThinkingTrace | null>(null);
  const [metaToken, setMetaToken] = useState('');
  const [metaAccountId, setMetaAccountId] = useState('');
  const [metaRegion, setMetaRegion] = useState<MetaApiRegion>('london');

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const [reps, watch, acc, mem, rp, learn, br, meta] = await Promise.all([
        listIntelReports(),
        listWatchlist(),
        getDemoAccount(),
        loadTradingAgentMemory(),
        getRiskProfile(),
        getLearningStats(),
        getBrokerConnection(),
        getMetaApiConfig(),
      ]);
      setReports(reps);
      setWatchCount(watch.length);
      setAccount(acc);
      setMemory(mem);
      setRisk(rp);
      setLearning(learn);
      setBroker(br);
      if (meta) {
        setMetaToken(meta.token || '');
        setMetaAccountId(meta.accountId || '');
        setMetaRegion(meta.region || 'london');
      }
      try {
        const snap = await fetchMarketSnapshot(chartSymbol);
        setSnapshot(snap);
      } catch { /* ignore */ }
    } finally {
      setLoading(false);
    }
  }, [chartSymbol]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const summary = useMemo(() => summarizeIntel(reports, watchCount), [reports, watchCount]);
  const eq = account ? equity(account) : 0;
  const upnl = account ? unrealizedPnl(account) : 0;

  const runResearch = async () => {
    setRunning(true);
    try {
      const r = await runTradingResearch({ ticker: symbol });
      toast.success(`Research done · ${r.signal}`);
      await reload();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    } finally {
      setRunning(false);
    }
  };

  /** Full institutional research cycle — the 18-agent CrewAI Flow (director
   *  planning, multi-source data retrieval, specialist analysis, adversarial
   *  debate, hypothesis generation, backtest validation, ecosystem
   *  distribution). Much slower than "Run research" (many sequential agent
   *  stages) but far deeper. Result is stored as a normal intel report,
   *  tagged source: crewai so it's visible in the Intel tab. */
  const runDeepResearch = async () => {
    setDeepRunning(true);
    try {
      const res = await flowRun('trading_intelligence', {
        asset: symbol,
        topic: `${symbol} institutional research cycle`,
        depth: 'standard',
      });
      if (res.status !== 'ok') {
        toast.error(res.error || 'Deep research failed');
        return;
      }
      const reportText = (res.state?.research_report as string | undefined)
        ?? (res.state?.hypotheses as string | undefined)
        ?? res.result
        ?? 'No report text returned.';
      const highConfidence = res.state?.confidence_gate_decision === 'high_confidence_findings';
      const report = createEmptyReport({ ticker: symbol, source: 'crewai' });
      await upsertIntelReport({
        ...report,
        status: 'complete',
        confidence: highConfidence ? 0.75 : 0.45,
        thesis: reportText.slice(0, 2000),
        body: reportText,
        tags: ['institutional', 'crewai-flow'],
      });
      toast.success(`Deep research done · ${highConfidence ? 'high confidence' : 'needs monitoring'}`);
      await reload();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    } finally {
      setDeepRunning(false);
    }
  };

  const runAgent = async () => {
    setAgentRunning(true);
    try {
      const result = await runTradingAgent({
        symbol: chartSymbol,
        autoExecute: true,
        indicatorHint: indicatorSnap
          ? {
              sma20: indicatorSnap.sma20,
              sma50: indicatorSnap.sma50,
              rsi14: indicatorSnap.rsi14,
              fvgCount: indicatorSnap.fvgCount,
              obCount: indicatorSnap.obCount,
              pdh: indicatorSnap.pdh,
              pdl: indicatorSnap.pdl,
            }
          : undefined,
      } as Parameters<typeof runTradingAgent>[0]);
      if (result.trace) setLastTrace(result.trace);
      toast.success(
        result.error
          ?? (result.decision ? `${result.decision.action.toUpperCase()} · ${result.decision.rationale}` : 'Agent cycle complete'),
      );
      await reload();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    } finally {
      setAgentRunning(false);
    }
  };

  const tabs: { id: TabId; label: string }[] = [
    { id: 'desk', label: 'Research + Chart' },
    { id: 'intel', label: 'Intel' },
    { id: 'agent', label: 'Agent' },
    { id: 'demo', label: 'Demo book' },
  ];

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="h-full flex flex-col overflow-hidden"
      style={{ background: '#050505' }}
    >
      <div className="flex items-center gap-2 px-4 py-2 border-b" style={{ borderColor: 'rgba(255,255,255,0.06)' }}>
        <LineChart size={16} style={{ color: '#a78bfa' }} />
        <span className="text-sm font-semibold" style={{ color: '#F5F0E6' }}>Trading Intel</span>
        <span className="text-[10px] px-2 py-0.5 rounded-full" style={{ background: 'rgba(167,139,250,0.15)', color: '#a78bfa' }}>
          {isAxeApiConfigured ? 'CrewAI ON' : 'Local desk'}
        </span>
        <div className="flex-1" />
        <input
          value={chartSymbol}
          onChange={e => setChartSymbol(e.target.value.toUpperCase())}
          className="w-28 rounded px-2 py-1 text-[12px] font-mono-data"
          style={{ background: '#0a0a0a', border: '1px solid rgba(255,255,255,0.1)', color: '#F5F0E6' }}
          title="Chart / agent symbol"
        />
        <button type="button" onClick={() => void reload()} className="p-1.5 rounded" style={{ color: 'rgba(255,255,255,0.45)' }}>
          <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
        </button>
      </div>

      <div className="flex gap-1 px-3 pt-2 border-b" style={{ borderColor: 'rgba(255,255,255,0.06)' }}>
        {tabs.map(t => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className="px-3 py-1.5 text-[12px]"
            style={{
              color: tab === t.id ? '#F5F0E6' : 'rgba(255,255,255,0.4)',
              borderBottom: tab === t.id ? '2px solid #a78bfa' : '2px solid transparent',
              marginBottom: -1,
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto p-3 space-y-3">
        {tab === 'desk' && (
          <>
            <div className="flex items-center gap-2 flex-wrap">
              <input
                value={symbol}
                onChange={e => setSymbol(e.target.value.toUpperCase())}
                className="w-28 rounded px-2 py-1 text-[12px] font-mono-data"
                style={{ background: '#0a0a0a', border: '1px solid rgba(255,255,255,0.1)', color: '#F5F0E6' }}
                placeholder="Research symbol"
              />
              <button
                type="button"
                disabled={running}
                onClick={() => void runResearch()}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px]"
                style={{ background: 'rgba(167,139,250,0.15)', color: '#c4b5fd', border: '1px solid rgba(167,139,250,0.3)' }}
              >
                {running ? <Loader2 size={14} className="animate-spin" /> : <Radar size={14} />}
                Run research
              </button>
              <button
                type="button"
                disabled={deepRunning}
                onClick={() => void runDeepResearch()}
                title="Full institutional research cycle — director planning, multi-source data, specialist debate, backtest validation. Slower, much deeper."
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px]"
                style={{ background: 'rgba(244,182,64,0.12)', color: '#f4c26e', border: '1px solid rgba(244,182,64,0.3)' }}
              >
                {deepRunning ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />}
                Deep research
              </button>
              <button
                type="button"
                disabled={agentRunning}
                onClick={() => void runAgent()}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px]"
                style={{ background: 'rgba(52,211,153,0.12)', color: '#6ee7b7', border: '1px solid rgba(52,211,153,0.28)' }}
              >
                {agentRunning ? <Loader2 size={14} className="animate-spin" /> : <Bot size={14} />}
                Run agent
              </button>
              <div className="flex-1" />
              <span className="text-[11px] font-mono-data" style={{ color: 'rgba(255,255,255,0.4)' }}>
                Equity ${eq.toFixed(0)} · uPnL {upnl >= 0 ? '+' : ''}{upnl.toFixed(2)}
              </span>
            </div>

            <div style={{ height: 'min(72vh, 720px)', minHeight: 520 }} className="w-full">
              <CompanionStyleChart symbol={chartSymbol} timeframe="1h" onIndicators={setIndicatorSnap} />
            </div>
            {indicatorSnap && (
              <div className="mt-1 flex flex-wrap gap-2 text-[10px] font-mono-data" style={{ color: 'rgba(255,255,255,0.4)' }}>
                <span>Agent feed · last {indicatorSnap.last.toFixed(2)}</span>
                {indicatorSnap.sma20 != null && <span>SMA20 {indicatorSnap.sma20.toFixed(2)}</span>}
                {indicatorSnap.sma50 != null && <span>SMA50 {indicatorSnap.sma50.toFixed(2)}</span>}
                {indicatorSnap.rsi14 != null && <span>RSI {indicatorSnap.rsi14.toFixed(1)}</span>}
                <span>FVG×{indicatorSnap.fvgCount}</span>
                <span>OB×{indicatorSnap.obCount}</span>
                {indicatorSnap.pdh != null && <span>PDH {indicatorSnap.pdh.toFixed(2)}</span>}
                {indicatorSnap.pdl != null && <span>PDL {indicatorSnap.pdl.toFixed(2)}</span>}
              </div>
            )}

            {reports[0] && (
              <WidgetCard title="Latest intel">
                <div className="flex items-center gap-2 mb-1">
                  <Badge signal={reports[0].signal} />
                  <span className="text-[12px]" style={{ color: '#F5F0E6' }}>{reports[0].ticker}</span>
                  <span className="text-[11px]" style={{ color: 'rgba(255,255,255,0.35)' }}>{reports[0].createdAt?.slice(0, 19)}</span>
                </div>
                <p className="text-[12px] leading-relaxed" style={{ color: 'rgba(255,255,255,0.55)' }}>
                  {reports[0].thesis?.slice(0, 400)}
                </p>
              </WidgetCard>
            )}
          </>
        )}

        {tab === 'intel' && (
          <div className="space-y-2">
            <div className="text-[11px]" style={{ color: 'rgba(255,255,255,0.4)' }}>
              {summary.total} reports · bullish {summary.bySignal.BUY} · bearish {summary.bySignal.SELL}
            </div>
            {reports.map(r => (
              <WidgetCard
                key={r.id}
                title={`${r.ticker} · ${r.horizon || '—'}`}
                headerAction={
                  <button type="button" className="text-[10px]" style={{ color: '#f87171' }} onClick={() => void deleteIntelReport(r.id).then(reload)}>
                    Delete
                  </button>
                }
              >
                <div className="flex items-center gap-2 mb-1">
                  <Badge signal={r.signal} />
                  <span className="text-[10px]" style={{ color: 'rgba(255,255,255,0.35)' }}>{r.createdAt?.slice(0, 19)}</span>
                </div>
                <p className="text-[12px]" style={{ color: 'rgba(255,255,255,0.55)' }}>{r.thesis}</p>
              </WidgetCard>
            ))}
            {!reports.length && <p className="text-[12px]" style={{ color: 'rgba(255,255,255,0.35)' }}>No intel yet — run research.</p>}
          </div>
        )}

        {tab === 'agent' && (
          <div className="space-y-3">
            <WidgetCard title="MetaAPI / MT5">
              <div className="grid gap-2">
                <input
                  value={metaToken}
                  onChange={e => setMetaToken(e.target.value)}
                  placeholder="MetaAPI token"
                  className="rounded px-2 py-1.5 text-[12px]"
                  style={{ background: '#0a0a0a', border: '1px solid rgba(255,255,255,0.1)', color: '#F5F0E6' }}
                />
                <input
                  value={metaAccountId}
                  onChange={e => setMetaAccountId(e.target.value)}
                  placeholder="Account ID"
                  className="rounded px-2 py-1.5 text-[12px]"
                  style={{ background: '#0a0a0a', border: '1px solid rgba(255,255,255,0.1)', color: '#F5F0E6' }}
                />
                <div className="flex gap-2">
                  <select
                    value={metaRegion}
                    onChange={e => setMetaRegion(e.target.value as MetaApiRegion)}
                    className="rounded px-2 py-1.5 text-[12px] flex-1"
                    style={{ background: '#0a0a0a', border: '1px solid rgba(255,255,255,0.1)', color: '#F5F0E6' }}
                  >
                    {['london', 'new-york', 'singapore', 'tokyo'].map(r => (
                      <option key={r} value={r}>{r}</option>
                    ))}
                  </select>
                  <button
                    type="button"
                    className="px-3 py-1.5 rounded text-[12px]"
                    style={{ background: 'rgba(167,139,250,0.15)', color: '#c4b5fd' }}
                    onClick={async () => {
                      await saveMetaApiConfig({ token: metaToken, accountId: metaAccountId, region: metaRegion, enabled: true });
                      const probe = await metaApiGetAccount();
                      toast[probe.ok ? 'success' : 'error'](probe.ok ? 'MetaAPI connected' : probe.error);
                      await connectBrokerKind('mt5_demo');
                      await reload();
                    }}
                  >
                    Save & probe
                  </button>
                </div>
                <div className="text-[11px]" style={{ color: 'rgba(255,255,255,0.4)' }}>
                  Broker: {broker?.label || '—'} · {broker?.connected ? 'connected' : 'offline'}
                </div>
              </div>
            </WidgetCard>

            <WidgetCard title="Risk">
              <div className="flex gap-2">
                {([['personal_demo', 'personal'], ['funded_challenge', 'funded']] as const).map(([m, label]) => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => void setRiskMode(m as RiskMode).then(reload)}
                    className="px-3 py-1 rounded text-[11px]"
                    style={{
                      color: risk?.mode === m ? '#F5F0E6' : 'rgba(255,255,255,0.4)',
                      background: risk?.mode === m ? 'rgba(167,139,250,0.2)' : 'rgba(255,255,255,0.04)',
                    }}
                  >
                    {label}
                  </button>
                ))}
              </div>
              {risk && (
                <p className="text-[11px] mt-2 font-mono-data" style={{ color: 'rgba(255,255,255,0.45)' }}>
                  riskPerTrade {(risk.riskPerTradePct * 100).toFixed(1)}% · maxTrades/day {risk.maxTradesPerDay} · dailyLoss {(risk.maxDailyLossPct * 100).toFixed(1)}%
                </p>
              )}
            </WidgetCard>

            <WidgetCard title="Learning">
              {learning ? (
                <div className="text-[12px] font-mono-data space-y-1" style={{ color: 'rgba(255,255,255,0.55)' }}>
                  <div>Trades {learning.tradesClosed} · Win rate {(learning.winRate * 100).toFixed(0)}%</div>
                  <div>W/L {learning.wins}/{learning.losses} · learned min-conf {(learning.learnedMinConfidence * 100).toFixed(0)}%</div>
                  {learning.lastLesson && <div style={{ color: 'rgba(255,255,255,0.4)' }}>{learning.lastLesson}</div>}
                </div>
              ) : (
                <p className="text-[11px]" style={{ color: 'rgba(255,255,255,0.35)' }}>No stats yet</p>
              )}
            </WidgetCard>

            {lastTrace && (
              <WidgetCard title="Last thinking">
                <div className="space-y-1">
                  {lastTrace.steps.map((s, i) => (
                    <div key={i} className="text-[11px]" style={{ color: 'rgba(255,255,255,0.5)' }}>
                      <span style={{ color: '#a78bfa' }}>{s.phase}</span> — {s.detail}
                    </div>
                  ))}
                </div>
              </WidgetCard>
            )}

            <WidgetCard title="Agent memory">
              <div className="max-h-[240px] overflow-y-auto space-y-1">
                {memory.slice(0, 20).map(m => (
                  <div key={m.id} className="rounded p-1.5 text-[11px]" style={{ background: 'rgba(255,255,255,0.04)' }}>
                    <div style={{ color: '#f472b6' }}>{m.key.replace(/^ta:[^:]+:/, '')}</div>
                    <div style={{ color: 'rgba(255,255,255,0.45)' }} className="line-clamp-3">{String(m.value).slice(0, 240)}</div>
                  </div>
                ))}
                {!memory.length && <p className="text-[11px]" style={{ color: 'rgba(255,255,255,0.35)' }}>Empty</p>}
              </div>
            </WidgetCard>

            <button
              type="button"
              disabled={agentRunning}
              onClick={() => void runAgent()}
              className="flex items-center gap-2 px-4 py-2 rounded-lg text-[13px]"
              style={{ background: 'rgba(52,211,153,0.15)', color: '#6ee7b7', border: '1px solid rgba(52,211,153,0.3)' }}
            >
              {agentRunning ? <Loader2 size={16} className="animate-spin" /> : <Play size={16} />}
              Run trading agent cycle
            </button>
          </div>
        )}

        {tab === 'demo' && account && (
          <WidgetCard title="Demo book (local mirror)" headerAction={
            <button type="button" className="text-[10px]" style={{ color: '#f87171' }} onClick={() => void resetDemoAccount().then(reload)}>Reset $100k</button>
          }>
            <div className="grid grid-cols-3 gap-2 mb-3 text-sm font-mono-data">
              <div><div className="text-[9px]" style={{ color: 'rgba(255,255,255,0.35)' }}>Cash</div><div style={{ color: '#F5F0E6' }}>${account.cash.toFixed(2)}</div></div>
              <div><div className="text-[9px]" style={{ color: 'rgba(255,255,255,0.35)' }}>Equity</div><div style={{ color: '#a78bfa' }}>${eq.toFixed(2)}</div></div>
              <div><div className="text-[9px]" style={{ color: 'rgba(255,255,255,0.35)' }}>uPnL</div><div style={{ color: upnl >= 0 ? '#34d399' : '#f87171' }}>${upnl.toFixed(2)}</div></div>
            </div>
            <div className="text-[10px] uppercase mb-1" style={{ color: 'rgba(255,255,255,0.35)' }}>Open positions</div>
            {!account.positions.length && <p className="text-[11px]" style={{ color: 'rgba(255,255,255,0.35)' }}>Flat</p>}
            {account.positions.map(p => {
              const mark = p.markPrice ?? p.avgPrice;
              const pnl = (mark - p.avgPrice) * p.qty;
              return (
                <div key={p.symbol} className="flex justify-between text-[12px] font-mono-data mb-1" style={{ color: '#F5F0E6' }}>
                  <span>{p.symbol} · {p.qty} @ {p.avgPrice.toFixed(2)}</span>
                  <span style={{ color: pnl >= 0 ? '#34d399' : '#f87171' }}>{pnl >= 0 ? '+' : ''}{pnl.toFixed(2)}</span>
                </div>
              );
            })}
            <div className="text-[10px] uppercase mt-3 mb-1" style={{ color: 'rgba(255,255,255,0.35)' }}>Fills / closed</div>
            <div className="max-h-[280px] overflow-y-auto space-y-1">
              {account.trades.slice(0, 40).map(t => (
                <div key={t.id} className="text-[11px] flex justify-between" style={{ color: 'rgba(255,255,255,0.5)' }}>
                  <span style={{ color: t.side === 'buy' ? '#34d399' : '#f87171' }}>{t.side.toUpperCase()} {t.qty} {t.symbol} @ {t.price}</span>
                  <span>{t.createdAt.slice(11, 19)}</span>
                </div>
              ))}
            </div>
          </WidgetCard>
        )}
      </div>
    </motion.div>
  );
}
