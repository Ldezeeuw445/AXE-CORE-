/**
 * Trading Intel Dashboard — research (CrewAI-first) + charts + demo trading agent.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  BookOpen, Bot, LineChart, Loader2, Play, Radar, RefreshCw,
  Search, Shield, Trash2, Wallet,
} from 'lucide-react';
import { WidgetCard } from '@/presentation/components/widgets/WidgetCard';
import {
  AGENT_CATALOG, SIGNAL_META, type TradingIntelReport, type TradingSignal,
} from '@/domain/tradingIntel/types';
import {
  deleteIntelReport, listIntelReports, listWatchlist, summarizeIntel,
  type TradingIntelWatchlistItem,
} from '@/infrastructure/persistence/tradingIntelService';
import { runTradingResearch } from '@/application/tradingIntel/runTradingResearch';
import { isAxeApiConfigured } from '@/infrastructure/gateways/axeCoreApiService';
import { fetchMarketSnapshot, rsi, sma } from '@/infrastructure/gateways/marketDataService';
import type { MarketSnapshot } from '@/domain/tradingIntel/demoTypes';
import {
  equity, getDemoAccount, resetDemoAccount, unrealizedPnl,
} from '@/infrastructure/persistence/demoTradingService';
import type { DemoAccount } from '@/domain/tradingIntel/demoTypes';
import { runTradingAgent } from '@/application/tradingIntel/tradingAgentEngine';
import { loadTradingAgentMemory } from '@/infrastructure/persistence/tradingAgentMemoryService';
import type { GlobalMemoryEntry } from '@/infrastructure/persistence/globalMemoryService';
import { getRiskProfile, setRiskMode, saveRiskProfile } from '@/infrastructure/persistence/tradingRiskService';
import { getLearningStats, listThinkingTraces } from '@/infrastructure/persistence/tradingLearningService';
import { getBrokerConnection, connectBrokerKind } from '@/infrastructure/gateways/brokerConnector';
import type { RiskProfile, ThinkingTrace, AgentLearningStats, BrokerConnection } from '@/domain/tradingIntel/botTypes';
import { toast } from 'sonner';

type TabId = 'desk' | 'reports' | 'chart' | 'agent' | 'demo' | 'pipeline';

const TABS: { id: TabId; label: string; icon: typeof Radar }[] = [
  { id: 'desk', label: 'Research', icon: Radar },
  { id: 'reports', label: 'Intel', icon: BookOpen },
  { id: 'chart', label: 'Chart', icon: LineChart },
  { id: 'agent', label: 'Agent', icon: Bot },
  { id: 'demo', label: 'Demo Book', icon: Wallet },
  { id: 'pipeline', label: 'Pipeline', icon: Shield },
];

function SignalBadge({ signal }: { signal: TradingSignal }) {
  const m = SIGNAL_META[signal];
  return (
    <span className="text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-full"
      style={{ color: m.color, background: m.bg, border: `1px solid ${m.color}33` }}>
      {m.label}
    </span>
  );
}

function pct(n: number) { return `${Math.round(n * 100)}%`; }

function MiniChart({ bars }: { bars: MarketSnapshot['bars'] }) {
  if (!bars.length) return null;
  const w = 320, h = 120, pad = 4;
  const closes = bars.map(b => b.c);
  const min = Math.min(...closes);
  const max = Math.max(...closes);
  const range = max - min || 1;
  const pts = closes.map((c, i) => {
    const x = pad + (i / (closes.length - 1)) * (w - pad * 2);
    const y = h - pad - ((c - min) / range) * (h - pad * 2);
    return `${x},${y}`;
  }).join(' ');
  const up = closes[closes.length - 1] >= closes[0];
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="w-full h-[140px]">
      <polyline fill="none" stroke={up ? '#34d399' : '#f87171'} strokeWidth="1.5" points={pts} />
    </svg>
  );
}

export default function TradingIntel() {
  const [tab, setTab] = useState<TabId>('desk');
  const [reports, setReports] = useState<TradingIntelReport[]>([]);
  const [watch, setWatch] = useState<TradingIntelWatchlistItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [ticker, setTicker] = useState('BTC-USD');
  const [notes, setNotes] = useState('');
  const [horizon, setHorizon] = useState('swing');
  const [running, setRunning] = useState(false);
  const [phase, setPhase] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [filterSignal, setFilterSignal] = useState<TradingSignal | 'all'>('all');
  const [query, setQuery] = useState('');
  const [snap, setSnap] = useState<MarketSnapshot | null>(null);
  const [chartLoading, setChartLoading] = useState(false);
  const [account, setAccount] = useState<DemoAccount | null>(null);
  const [agentBusy, setAgentBusy] = useState(false);
  const [lastDecision, setLastDecision] = useState('');
  const [agentMem, setAgentMem] = useState<GlobalMemoryEntry[]>([]);
  const [autoExec, setAutoExec] = useState(true);
  const [trace, setTrace] = useState<ThinkingTrace | null>(null);
  const [risk, setRisk] = useState<RiskProfile | null>(null);
  const [learning, setLearning] = useState<AgentLearningStats | null>(null);
  const [broker, setBroker] = useState<BrokerConnection | null>(null);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const [r, w, acc, mem, rk, learn, br] = await Promise.all([
        listIntelReports(), listWatchlist(), getDemoAccount(), loadTradingAgentMemory(30),
        getRiskProfile(), getLearningStats(), getBrokerConnection(),
      ]);
      setReports(r); setWatch(w); setAccount(acc); setAgentMem(mem);
      setRisk(rk); setLearning(learn); setBroker(br);
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { void reload(); }, [reload]);

  const loadChart = useCallback(async (sym: string) => {
    setChartLoading(true);
    try { setSnap(await fetchMarketSnapshot(sym)); }
    catch { toast.error('Chart fetch failed'); }
    finally { setChartLoading(false); }
  }, []);

  useEffect(() => {
    if (tab === 'chart' || tab === 'agent' || tab === 'desk') void loadChart(ticker);
  }, [tab, ticker, loadChart]);

  const stats = useMemo(() => summarizeIntel(reports, watch.length), [reports, watch]);
  const selected = useMemo(
    () => reports.find(r => r.id === selectedId) ?? reports[0] ?? null,
    [reports, selectedId],
  );

  const filtered = useMemo(() => reports.filter(r => {
    if (r.status === 'archived') return false;
    if (filterSignal !== 'all' && r.signal !== filterSignal) return false;
    if (query.trim()) {
      const q = query.toLowerCase();
      return r.ticker.toLowerCase().includes(q) || r.thesis.toLowerCase().includes(q);
    }
    return true;
  }), [reports, filterSignal, query]);

  const runDesk = async () => {
    if (!ticker.trim()) return;
    setRunning(true);
    setPhase('Starting research crew…');
    try {
      const report = await runTradingResearch({
        ticker, notes, horizon,
        useCrew: true,
        onProgress: (_p, d) => setPhase(d || _p),
      });
      toast.success(`Intel · ${report.ticker}`, {
        description: `${report.signal} · ${pct(report.confidence)} · ${report.source}`,
      });
      setSelectedId(report.id);
      setTab('reports');
      await reload();
    } catch (e) {
      toast.error('Research failed', { description: e instanceof Error ? e.message : String(e) });
    } finally { setRunning(false); setPhase(''); }
  };

  const runAgent = async () => {
    setAgentBusy(true);
    try {
      const res = await runTradingAgent({ symbol: ticker, autoExecute: autoExec });
      setLastDecision(res.decision.rationale);
      setTrace(res.trace);
      if (res.blockedByRisk) toast.message('Risk gate', { description: res.blockedByRisk });
      if (res.error) toast.error('Agent', { description: res.error });
      else if (res.tradeId) toast.success('Demo trade filled', { description: res.decision.action.toUpperCase() });
      else toast.message('Agent', { description: `${res.decision.action.toUpperCase()} · no fill` });
      await reload();
      await loadChart(ticker);
    } finally { setAgentBusy(false); }
  };

  const eq = account ? equity(account) : 0;
  const upnl = account ? unrealizedPnl(account) : 0;

  return (
    <motion.div className="h-full flex flex-col min-h-0" initial={{ opacity: 0 }} animate={{ opacity: 1 }} style={{ background: '#000' }}>
      <div className="flex-shrink-0 px-4 sm:px-5 pt-4 pb-3" style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <LineChart size={16} style={{ color: '#34d399' }} />
              <h1 className="text-page-title font-semibold" style={{ color: '#F5F0E6' }}>Trading Intel</h1>
              <span className="text-[9px] uppercase tracking-widest px-1.5 py-0.5 rounded"
                style={{ color: isAxeApiConfigured ? '#34d399' : '#fbbf24', border: '1px solid rgba(255,255,255,0.1)' }}>
                {isAxeApiConfigured ? 'CrewAI research · ON' : 'CrewAI offline · local desk'}
              </span>
            </div>
            <p className="text-xs-custom max-w-2xl" style={{ color: 'rgba(255,255,255,0.4)' }}>
              Research → intel → live chart → self-improving demo agent with risk modes. Paper only until MT5/Krypt bridge is wired.
            </p>
          </div>
          <button type="button" onClick={() => void reload()} className="self-start flex items-center gap-1.5 text-[11px] px-2.5 py-1.5 rounded-md"
            style={{ color: 'rgba(255,255,255,0.5)', border: '1px solid rgba(255,255,255,0.08)' }}>
            <RefreshCw size={12} className={loading ? 'animate-spin' : ''} /> Refresh
          </button>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-6 gap-2 mt-3">
          {[
            { label: 'Reports', value: stats.total, color: '#22d3ee' },
            { label: 'Buys', value: stats.bySignal.BUY, color: '#10b981' },
            { label: 'Watchlist', value: stats.watchCount, color: '#fbbf24' },
            { label: 'Demo equity', value: account ? `$${eq.toFixed(0)}` : '—', color: '#a78bfa' },
            { label: 'uPnL', value: account ? `$${upnl.toFixed(0)}` : '—', color: upnl >= 0 ? '#34d399' : '#f87171' },
            { label: 'Agent mem', value: agentMem.length, color: '#f472b6' },
          ].map(c => (
            <div key={c.label} className="rounded-xl px-3 py-2" style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)' }}>
              <div className="text-[9px] uppercase tracking-wider" style={{ color: 'rgba(255,255,255,0.35)' }}>{c.label}</div>
              <div className="text-lg font-semibold font-mono-data" style={{ color: c.color }}>{c.value}</div>
            </div>
          ))}
        </div>

        <div className="flex gap-1 mt-3 overflow-x-auto">
          {TABS.map(t => {
            const Icon = t.icon;
            const active = tab === t.id;
            return (
              <button key={t.id} type="button" onClick={() => setTab(t.id)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] whitespace-nowrap"
                style={{
                  color: active ? '#a5f3fc' : 'rgba(255,255,255,0.4)',
                  background: active ? 'rgba(34,211,238,0.1)' : 'transparent',
                  border: active ? '1px solid rgba(34,211,238,0.25)' : '1px solid transparent',
                }}>
                <Icon size={12} />{t.label}
              </button>
            );
          })}
        </div>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto p-4 sm:p-5">
        <AnimatePresence mode="wait">
          {tab === 'desk' && (
            <motion.div key="desk" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="grid grid-cols-1 xl:grid-cols-5 gap-4">
              <div className="xl:col-span-2">
                <WidgetCard title="Research desk (CrewAI first)" headerAction={<Radar size={13} style={{ color: '#34d399' }} />}>
                  <div className="space-y-3">
                    <input value={ticker} onChange={e => setTicker(e.target.value.toUpperCase())}
                      className="w-full rounded-lg px-3 py-2 text-sm font-mono-data outline-none"
                      style={{ background: 'rgba(0,0,0,0.5)', border: '1px solid rgba(255,255,255,0.1)', color: '#F5F0E6' }}
                      placeholder="BTC-USD / ETH-USD / AAPL" />
                    <select value={horizon} onChange={e => setHorizon(e.target.value)}
                      className="w-full rounded-lg px-2 py-2 text-sm outline-none"
                      style={{ background: 'rgba(0,0,0,0.5)', border: '1px solid rgba(255,255,255,0.1)', color: '#F5F0E6' }}>
                      <option value="scalp">Scalp</option>
                      <option value="intraday">Intraday</option>
                      <option value="swing">Swing</option>
                      <option value="position">Position</option>
                    </select>
                    <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={4}
                      placeholder="Context for research crew…"
                      className="w-full rounded-lg px-3 py-2 text-sm outline-none resize-none"
                      style={{ background: 'rgba(0,0,0,0.5)', border: '1px solid rgba(255,255,255,0.1)', color: '#F5F0E6' }} />
                    <button type="button" disabled={running || !ticker.trim()} onClick={() => void runDesk()}
                      className="w-full flex items-center justify-center gap-2 rounded-lg py-2.5 text-sm font-semibold disabled:opacity-40"
                      style={{ background: 'linear-gradient(90deg, rgba(16,185,129,0.9), rgba(34,211,238,0.85))', color: '#000' }}>
                      {running ? <Loader2 size={15} className="animate-spin" /> : <Radar size={15} />}
                      {running ? phase || 'Crew running…' : 'Run research crew'}
                    </button>
                  </div>
                </WidgetCard>
              </div>
              <div className="xl:col-span-3">
                <WidgetCard title="Quick chart">
                  {snap ? (
                    <>
                      <MiniChart bars={snap.bars} />
                      <div className="flex gap-3 text-[11px] mt-2 font-mono-data" style={{ color: 'rgba(255,255,255,0.5)' }}>
                        <span>Last {snap.last.toFixed(2)}</span>
                        <span>SMA20 {sma(snap.bars, 20)?.toFixed(2) ?? '—'}</span>
                        <span>RSI {rsi(snap.bars)?.toFixed(1) ?? '—'}</span>
                        <span>{snap.source}</span>
                      </div>
                    </>
                  ) : (
                    <p className="text-[11px] py-8 text-center" style={{ color: 'rgba(255,255,255,0.35)' }}>{chartLoading ? 'Loading…' : 'No chart data'}</p>
                  )}
                </WidgetCard>
              </div>
            </motion.div>
          )}

          {tab === 'reports' && (
            <motion.div key="rep" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="grid grid-cols-1 lg:grid-cols-5 gap-4">
              <div className="lg:col-span-2 space-y-2">
                <div className="flex gap-2">
                  <div className="relative flex-1">
                    <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2" style={{ color: 'rgba(255,255,255,0.3)' }} />
                    <input value={query} onChange={e => setQuery(e.target.value)} placeholder="Search…"
                      className="w-full rounded-lg pl-8 pr-3 py-2 text-sm outline-none"
                      style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', color: '#F5F0E6' }} />
                  </div>
                  <select value={filterSignal} onChange={e => setFilterSignal(e.target.value as TradingSignal | 'all')}
                    className="rounded-lg px-2 text-[11px] outline-none"
                    style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', color: '#F5F0E6' }}>
                    <option value="all">All</option>
                    {Object.keys(SIGNAL_META).map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                </div>
                <div className="space-y-1.5 max-h-[60vh] overflow-y-auto">
                  {filtered.map(r => (
                    <button key={r.id} type="button" onClick={() => setSelectedId(r.id)}
                      className="w-full text-left rounded-xl px-3 py-2.5"
                      style={{
                        background: selected?.id === r.id ? 'rgba(34,211,238,0.08)' : 'rgba(255,255,255,0.02)',
                        border: selected?.id === r.id ? '1px solid rgba(34,211,238,0.28)' : '1px solid rgba(255,255,255,0.06)',
                      }}>
                      <div className="flex items-center justify-between">
                        <span className="font-mono-data text-sm font-semibold" style={{ color: '#F5F0E6' }}>{r.ticker}</span>
                        <SignalBadge signal={r.signal} />
                      </div>
                      <div className="text-[10px] mt-1" style={{ color: 'rgba(255,255,255,0.35)' }}>{r.asOf} · {pct(r.confidence)} · {r.source}</div>
                      <p className="text-[11px] mt-1 line-clamp-2" style={{ color: 'rgba(255,255,255,0.45)' }}>{r.thesis}</p>
                    </button>
                  ))}
                  {!filtered.length && <p className="text-[11px] text-center py-8" style={{ color: 'rgba(255,255,255,0.35)' }}>No intel yet — run research.</p>}
                </div>
              </div>
              <div className="lg:col-span-3">
                {selected ? (
                  <WidgetCard title={`${selected.ticker} briefing`} headerAction={
                    <button type="button" onClick={() => void deleteIntelReport(selected.id).then(reload)} style={{ color: 'rgba(248,113,113,0.7)' }}><Trash2 size={13} /></button>
                  }>
                    <div className="space-y-3">
                      <div className="flex flex-wrap gap-2 items-center">
                        <SignalBadge signal={selected.signal} />
                        <span className="text-[11px] font-mono-data" style={{ color: '#a5f3fc' }}>{pct(selected.confidence)}</span>
                      </div>
                      <p className="text-sm" style={{ color: 'rgba(245,240,230,0.85)' }}>{selected.thesis}</p>
                      {selected.body && (
                        <pre className="text-[11px] whitespace-pre-wrap rounded-lg p-3 max-h-[280px] overflow-y-auto font-mono-data"
                          style={{ background: 'rgba(0,0,0,0.4)', border: '1px solid rgba(255,255,255,0.06)', color: 'rgba(245,240,230,0.7)' }}>{selected.body}</pre>
                      )}
                      <button type="button" className="text-[11px] px-3 py-1.5 rounded-lg"
                        style={{ background: 'rgba(52,211,153,0.15)', color: '#34d399' }}
                        onClick={() => { setTicker(selected.ticker); setTab('agent'); }}>Send to trading agent →</button>
                    </div>
                  </WidgetCard>
                ) : (
                  <p className="text-[12px] text-center py-16" style={{ color: 'rgba(255,255,255,0.35)' }}>Select a report</p>
                )}
              </div>
            </motion.div>
          )}

          {tab === 'chart' && (
            <motion.div key="chart" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="max-w-3xl">
              <WidgetCard title={`Chart · ${ticker}`}>
                <div className="flex gap-2 mb-3">
                  <input value={ticker} onChange={e => setTicker(e.target.value.toUpperCase())}
                    className="flex-1 rounded-lg px-3 py-2 text-sm font-mono-data outline-none"
                    style={{ background: 'rgba(0,0,0,0.5)', border: '1px solid rgba(255,255,255,0.1)', color: '#F5F0E6' }} />
                  <button type="button" onClick={() => void loadChart(ticker)}
                    className="px-3 rounded-lg text-sm" style={{ background: 'rgba(34,211,238,0.15)', color: '#a5f3fc' }}>{chartLoading ? '…' : 'Refresh'}</button>
                </div>
                {snap && (
                  <>
                    <MiniChart bars={snap.bars} />
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mt-3">
                      {[
                        { l: 'Last', v: snap.last.toFixed(4) },
                        { l: 'Change', v: snap.changePct != null ? `${snap.changePct.toFixed(2)}%` : '—' },
                        { l: 'SMA 20', v: sma(snap.bars, 20)?.toFixed(2) ?? '—' },
                        { l: 'RSI 14', v: rsi(snap.bars)?.toFixed(1) ?? '—' },
                      ].map(x => (
                        <div key={x.l} className="rounded-lg px-2 py-1.5" style={{ border: '1px solid rgba(255,255,255,0.06)' }}>
                          <div className="text-[9px]" style={{ color: 'rgba(255,255,255,0.35)' }}>{x.l}</div>
                          <div className="font-mono-data text-sm" style={{ color: '#F5F0E6' }}>{x.v}</div>
                        </div>
                      ))}
                    </div>
                    <p className="text-[10px] mt-2" style={{ color: 'rgba(255,255,255,0.3)' }}>Source: {snap.source} · live public prices</p>
                  </>
                )}
              </WidgetCard>
            </motion.div>
          )}

          {tab === 'agent' && (
            <motion.div key="agent" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <WidgetCard title="AXE Trading Agent (demo)" headerAction={<Bot size={13} style={{ color: '#a78bfa' }} />}>
                <p className="text-[11px] mb-3" style={{ color: 'rgba(255,255,255,0.4)' }}>
                  One agent. Intel + live prices + private memory + risk gates → paper trade. Self-improves from outcomes.
                </p>
                <input value={ticker} onChange={e => setTicker(e.target.value.toUpperCase())}
                  className="w-full mb-2 rounded-lg px-3 py-2 text-sm font-mono-data outline-none"
                  style={{ background: 'rgba(0,0,0,0.5)', border: '1px solid rgba(255,255,255,0.1)', color: '#F5F0E6' }} />
                <label className="flex items-center gap-2 text-[11px] mb-3 cursor-pointer" style={{ color: 'rgba(255,255,255,0.5)' }}>
                  <input type="checkbox" checked={autoExec} onChange={e => setAutoExec(e.target.checked)} />
                  Auto-execute when risk + confidence allow
                </label>
                <button type="button" disabled={agentBusy} onClick={() => void runAgent()}
                  className="w-full flex items-center justify-center gap-2 rounded-lg py-2.5 text-sm font-semibold disabled:opacity-40"
                  style={{ background: 'linear-gradient(90deg, rgba(167,139,250,0.9), rgba(34,211,238,0.75))', color: '#000' }}>
                  {agentBusy ? <Loader2 size={15} className="animate-spin" /> : <Play size={15} />}
                  {agentBusy ? 'Agent thinking…' : 'Run trading agent'}
                </button>
                {lastDecision && (
                  <pre className="mt-3 text-[11px] whitespace-pre-wrap rounded-lg p-3 max-h-[120px] overflow-y-auto"
                    style={{ background: 'rgba(0,0,0,0.4)', border: '1px solid rgba(255,255,255,0.06)', color: 'rgba(245,240,230,0.7)' }}>{lastDecision}</pre>
                )}
                {trace && (
                  <div className="mt-3 space-y-1 max-h-[180px] overflow-y-auto">
                    <div className="text-[10px] uppercase" style={{ color: 'rgba(196,181,253,0.8)' }}>Decision journal</div>
                    {trace.steps.map(s => (
                      <div key={s.id} className="text-[10px] rounded px-2 py-1" style={{ border: '1px solid rgba(167,139,250,0.2)' }}>
                        <span style={{ color: '#c4b5fd' }}>{s.phase}</span> · {s.title}
                        <div style={{ color: 'rgba(255,255,255,0.45)' }}>{s.detail}</div>
                      </div>
                    ))}
                  </div>
                )}
                {risk && (
                  <div className="mt-3 text-[10px] space-y-1" style={{ color: 'rgba(255,255,255,0.45)' }}>
                    <div className="flex flex-wrap gap-1">
                      {(['personal_demo', 'funded_challenge', 'funded_live_rules'] as const).map(m => (
                        <button key={m} type="button" onClick={() => void setRiskMode(m).then(setRisk)}
                          className="px-1.5 py-0.5 rounded"
                          style={{ border: risk.mode === m ? '1px solid #34d399' : '1px solid rgba(255,255,255,0.12)', color: risk.mode === m ? '#34d399' : 'inherit' }}>
                          {m.replace(/_/g, ' ')}
                        </button>
                      ))}
                    </div>
                    <div>Risk/trade {(risk.riskPerTradePct * 100).toFixed(2)}% · min conf {(risk.minConfidence * 100).toFixed(0)}%</div>
                    {learning && <div>Learn winRate {(learning.winRate * 100).toFixed(0)}% · minConf {learning.learnedMinConfidence.toFixed(2)}</div>}
                    {broker && (
                      <div className="flex flex-wrap gap-1 pt-1">
                        <span style={{ color: '#a5f3fc' }}>{broker.label}</span>
                        <button type="button" className="underline" onClick={() => void connectBrokerKind('paper_live_prices').then(setBroker)}>Paper</button>
                        <button type="button" className="underline" onClick={() => void connectBrokerKind('mt5_demo').then(setBroker)}>MT5</button>
                        <button type="button" className="underline" onClick={() => void connectBrokerKind('krypt').then(setBroker)}>Krypt</button>
                      </div>
                    )}
                  </div>
                )}
              </WidgetCard>
              <WidgetCard title="Agent memory (global)">
                <div className="space-y-1.5 max-h-[360px] overflow-y-auto">
                  {agentMem.length === 0 && (
                    <p className="text-[11px]" style={{ color: 'rgba(255,255,255,0.35)' }}>Empty — run the agent to start its memory lane.</p>
                  )}
                  {agentMem.map(m => (
                    <div key={m.key} className="rounded-lg px-2.5 py-1.5 text-[10px]"
                      style={{ border: '1px solid rgba(255,255,255,0.06)', color: 'rgba(255,255,255,0.5)' }}>
                      <div style={{ color: '#f472b6' }}>{m.key.replace(/^ta:[^:]+:/, '')}</div>
                      <div className="line-clamp-3">{m.value.slice(0, 280)}</div>
                    </div>
                  ))}
                </div>
              </WidgetCard>
            </motion.div>
          )}

          {tab === 'demo' && (
            <motion.div key="demo" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="max-w-3xl">
              <WidgetCard title="Demo account" headerAction={
                <button type="button" className="text-[10px]" style={{ color: 'rgba(248,113,113,0.7)' }}
                  onClick={() => void resetDemoAccount().then(reload)}>Reset $100k</button>
              }>
                {account && (
                  <>
                    <div className="grid grid-cols-3 gap-2 mb-3">
                      <div><div className="text-[9px]" style={{ color: 'rgba(255,255,255,0.35)' }}>Cash</div>
                        <div className="font-mono-data" style={{ color: '#F5F0E6' }}>${account.cash.toFixed(2)}</div></div>
                      <div><div className="text-[9px]" style={{ color: 'rgba(255,255,255,0.35)' }}>Equity</div>
                        <div className="font-mono-data" style={{ color: '#a78bfa' }}>${eq.toFixed(2)}</div></div>
                      <div><div className="text-[9px]" style={{ color: 'rgba(255,255,255,0.35)' }}>uPnL</div>
                        <div className="font-mono-data" style={{ color: upnl >= 0 ? '#34d399' : '#f87171' }}>${upnl.toFixed(2)}</div></div>
                    </div>
                    <div className="text-[10px] uppercase mb-1" style={{ color: 'rgba(255,255,255,0.35)' }}>Positions</div>
                    {account.positions.length === 0 && <p className="text-[11px] mb-2" style={{ color: 'rgba(255,255,255,0.35)' }}>Flat</p>}
                    {account.positions.map(p => (
                      <div key={p.symbol} className="flex justify-between text-[12px] font-mono-data py-1" style={{ color: '#F5F0E6' }}>
                        <span>{p.symbol}</span><span>{p.qty} @ {p.avgPrice.toFixed(2)}</span>
                      </div>
                    ))}
                    <div className="text-[10px] uppercase mt-3 mb-1" style={{ color: 'rgba(255,255,255,0.35)' }}>Fills</div>
                    <div className="max-h-[220px] overflow-y-auto space-y-1">
                      {account.trades.slice(0, 30).map(t => (
                        <div key={t.id} className="text-[11px] flex justify-between gap-2" style={{ color: 'rgba(255,255,255,0.5)' }}>
                          <span className="font-mono-data" style={{ color: t.side === 'buy' ? '#34d399' : '#f87171' }}>
                            {t.side.toUpperCase()} {t.qty} {t.symbol} @ {t.price}
                          </span>
                          <span>{t.createdAt.slice(11, 19)}</span>
                        </div>
                      ))}
                    </div>
                  </>
                )}
              </WidgetCard>
            </motion.div>
          )}

          {tab === 'pipeline' && (
            <motion.div key="pipe" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-3">
              <WidgetCard title="Professional bot roadmap">
                <ul className="text-[12px] space-y-2" style={{ color: 'rgba(255,255,255,0.5)' }}>
                  <li>✅ Phase 1 — Paper + live public prices + intel + decision journal</li>
                  <li>✅ Phase 2 — Self-improving confidence floor + personal/funded risk modes</li>
                  <li>🔜 Phase 3 — MT5 demo bridge (MetaAPI/EA) + Krypt.cc settings API</li>
                  <li>🔜 Phase 4 — Optional live with hard kill-switch + approval gate</li>
                </ul>
              </WidgetCard>
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-2">
                {AGENT_CATALOG.map(a => (
                  <div key={a.role} className="rounded-lg px-3 py-2" style={{ border: `1px solid ${a.color}22`, background: `${a.color}08` }}>
                    <div className="text-[12px] font-medium" style={{ color: a.color }}>{a.label}</div>
                    <div className="text-[10px]" style={{ color: 'rgba(255,255,255,0.4)' }}>{a.description}</div>
                  </div>
                ))}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </motion.div>
  );
}
