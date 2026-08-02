/**
 * Trading Intel — research, live chart, self-improving demo agent, MetaAPI MT5.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { Bot, LineChart, Loader2, Play, Radar, RefreshCw } from 'lucide-react';
import { WidgetCard } from '@/presentation/components/widgets/WidgetCard';
import { SIGNAL_META, type TradingIntelReport, type TradingSignal } from '@/domain/tradingIntel/types';
import { deleteIntelReport, listIntelReports, summarizeIntel } from '@/infrastructure/persistence/tradingIntelService';
import { runTradingResearch } from '@/application/tradingIntel/runTradingResearch';
import { isAxeApiConfigured } from '@/infrastructure/gateways/axeCoreApiService';
import { fetchMarketSnapshot, rsi, sma } from '@/infrastructure/gateways/marketDataService';
import type { MarketSnapshot, DemoAccount } from '@/domain/tradingIntel/demoTypes';
import { equity, getDemoAccount, resetDemoAccount, unrealizedPnl } from '@/infrastructure/persistence/demoTradingService';
import { runTradingAgent } from '@/application/tradingIntel/tradingAgentEngine';
import { loadTradingAgentMemory } from '@/infrastructure/persistence/tradingAgentMemoryService';
import type { GlobalMemoryEntry } from '@/infrastructure/persistence/globalMemoryService';
import { getRiskProfile, setRiskMode } from '@/infrastructure/persistence/tradingRiskService';
import { getLearningStats } from '@/infrastructure/persistence/tradingLearningService';
import { getBrokerConnection, connectBrokerKind } from '@/infrastructure/gateways/brokerConnector';
import { getMetaApiConfig, saveMetaApiConfig, metaApiGetAccount } from '@/infrastructure/gateways/metaApiService';
import type { RiskProfile, ThinkingTrace, AgentLearningStats, BrokerConnection } from '@/domain/tradingIntel/botTypes';
import { toast } from 'sonner';

type TabId = 'desk' | 'intel' | 'agent' | 'demo';

function Badge({ signal }: { signal: TradingSignal }) {
  const m = SIGNAL_META[signal];
  return <span className="text-[10px] px-2 py-0.5 rounded-full" style={{ color: m.color, background: m.bg }}>{m.label}</span>;
}

function MiniChart({ bars }: { bars: MarketSnapshot['bars'] }) {
  if (bars.length < 2) return null;
  const w = 320, h = 110, pad = 4;
  const cs = bars.map(b => b.c);
  const min = Math.min(...cs), max = Math.max(...cs), range = max - min || 1;
  const pts = cs.map((c, i) => {
    const x = pad + (i / (cs.length - 1)) * (w - pad * 2);
    const y = h - pad - ((c - min) / range) * (h - pad * 2);
    return `${x},${y}`;
  }).join(' ');
  const up = cs[cs.length - 1] >= cs[0];
  return <svg viewBox={`0 0 ${w} ${h}`} className="w-full h-[120px]"><polyline fill="none" stroke={up ? '#34d399' : '#f87171'} strokeWidth="1.5" points={pts} /></svg>;
}

export default function TradingIntel() {
  const [tab, setTab] = useState<TabId>('desk');
  const [reports, setReports] = useState<TradingIntelReport[]>([]);
  const [account, setAccount] = useState<DemoAccount | null>(null);
  const [ticker, setTicker] = useState('BTC-USD');
  const [notes, setNotes] = useState('');
  const [running, setRunning] = useState(false);
  const [phase, setPhase] = useState('');
  const [selected, setSelected] = useState<TradingIntelReport | null>(null);
  const [snap, setSnap] = useState<MarketSnapshot | null>(null);
  const [agentBusy, setAgentBusy] = useState(false);
  const [autoExec, setAutoExec] = useState(true);
  const [rationale, setRationale] = useState('');
  const [trace, setTrace] = useState<ThinkingTrace | null>(null);
  const [mem, setMem] = useState<GlobalMemoryEntry[]>([]);
  const [risk, setRisk] = useState<RiskProfile | null>(null);
  const [learning, setLearning] = useState<AgentLearningStats | null>(null);
  const [broker, setBroker] = useState<BrokerConnection | null>(null);
  const [metaToken, setMetaToken] = useState('');
  const [metaAccountId, setMetaAccountId] = useState('');
  const [metaStatus, setMetaStatus] = useState('');

  const reload = useCallback(async () => {
    const [r, acc, m, rk, learn, br, meta] = await Promise.all([
      listIntelReports(), getDemoAccount(), loadTradingAgentMemory(25),
      getRiskProfile(), getLearningStats(), getBrokerConnection(), getMetaApiConfig(),
    ]);
    setReports(r); setAccount(acc); setMem(m); setRisk(rk); setLearning(learn); setBroker(br);
    if (meta) {
      setMetaToken(meta.token ? `••••${meta.token.slice(-4)}` : '');
      setMetaAccountId(meta.accountId);
      setMetaStatus(meta.enabled ? 'token saved' : 'disabled');
    }
    if (!selected && r[0]) setSelected(r[0]);
  }, [selected]);

  useEffect(() => { void reload(); }, []); // eslint-disable-line
  useEffect(() => { void fetchMarketSnapshot(ticker).then(setSnap).catch(() => {}); }, [ticker, tab]);

  const stats = useMemo(() => summarizeIntel(reports, 0), [reports]);
  const eq = account ? equity(account) : 0;
  const upnl = account ? unrealizedPnl(account) : 0;

  const runResearch = async () => {
    setRunning(true); setPhase('Crew…');
    try {
      const report = await runTradingResearch({ ticker, notes, useCrew: true, onProgress: (_p, d) => setPhase(d || _p) });
      toast.success(`${report.ticker} · ${report.signal}`);
      setSelected(report); setTab('intel'); await reload();
    } catch (e) { toast.error(e instanceof Error ? e.message : String(e)); }
    finally { setRunning(false); setPhase(''); }
  };

  const runAgent = async () => {
    setAgentBusy(true);
    try {
      const res = await runTradingAgent({ symbol: ticker, autoExecute: autoExec });
      setRationale(res.decision.rationale); setTrace(res.trace);
      if (res.blockedByRisk) toast.message('Risk', { description: res.blockedByRisk });
      if (res.tradeId) toast.success('Order path', { description: `${res.decision.action} · check MetaAPI/paper` });
      else toast.message('Agent', { description: res.decision.action });
      await reload();
    } finally { setAgentBusy(false); }
  };

  const tabs: { id: TabId; label: string }[] = [
    { id: 'desk', label: 'Research + Chart' },
    { id: 'intel', label: 'Intel' },
    { id: 'agent', label: 'Agent' },
    { id: 'demo', label: 'Demo Book' },
  ];

  return (
    <motion.div className="h-full flex flex-col min-h-0" style={{ background: '#000' }} initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
      <div className="px-4 pt-4 pb-3" style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
        <div className="flex items-center gap-2 mb-1">
          <LineChart size={16} style={{ color: '#34d399' }} />
          <h1 className="text-page-title font-semibold" style={{ color: '#F5F0E6' }}>Trading Intel</h1>
          <span className="text-[9px] px-1.5 py-0.5 rounded" style={{ color: isAxeApiConfigured ? '#34d399' : '#fbbf24', border: '1px solid rgba(255,255,255,0.12)' }}>
            {isAxeApiConfigured ? 'CrewAI ON' : 'Local desk'}
          </span>
        </div>
        <p className="text-xs-custom" style={{ color: 'rgba(255,255,255,0.4)' }}>
          Research → agent → paper of MetaAPI MT5 demo. Zet token + account id onder Agent voor echte demo-orders.
        </p>
        <div className="grid grid-cols-3 sm:grid-cols-6 gap-2 mt-3">
          {[
            ['Reports', stats.total, '#22d3ee'],
            ['Buys', stats.bySignal.BUY, '#10b981'],
            ['Equity', account ? `$${eq.toFixed(0)}` : '—', '#a78bfa'],
            ['uPnL', account ? `$${upnl.toFixed(0)}` : '—', upnl >= 0 ? '#34d399' : '#f87171'],
            ['Win%', learning ? `${(learning.winRate * 100).toFixed(0)}%` : '—', '#fbbf24'],
            ['Mem', mem.length, '#f472b6'],
          ].map(([l, v, c]) => (
            <div key={String(l)} className="rounded-xl px-2 py-1.5" style={{ border: '1px solid rgba(255,255,255,0.06)' }}>
              <div className="text-[9px]" style={{ color: 'rgba(255,255,255,0.35)' }}>{l}</div>
              <div className="font-mono-data text-sm" style={{ color: String(c) }}>{v}</div>
            </div>
          ))}
        </div>
        <div className="flex gap-1 mt-3">
          {tabs.map(t => (
            <button key={t.id} type="button" onClick={() => setTab(t.id)} className="px-3 py-1.5 rounded-lg text-[11px]"
              style={{ color: tab === t.id ? '#a5f3fc' : 'rgba(255,255,255,0.4)', background: tab === t.id ? 'rgba(34,211,238,0.1)' : 'transparent', border: tab === t.id ? '1px solid rgba(34,211,238,0.25)' : '1px solid transparent' }}>{t.label}</button>
          ))}
          <button type="button" onClick={() => void reload()} className="ml-auto p-1.5" style={{ color: 'rgba(255,255,255,0.4)' }}><RefreshCw size={12} /></button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {tab === 'desk' && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
            <WidgetCard title="Research (CrewAI first)" headerAction={<Radar size={13} style={{ color: '#34d399' }} />}>
              <input value={ticker} onChange={e => setTicker(e.target.value.toUpperCase())} className="w-full mb-2 rounded-lg px-3 py-2 text-sm font-mono-data outline-none" style={{ background: '#0a0a0a', border: '1px solid rgba(255,255,255,0.1)', color: '#F5F0E6' }} />
              <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={3} placeholder="Context for research…" className="w-full mb-2 rounded-lg px-3 py-2 text-sm outline-none resize-none" style={{ background: '#0a0a0a', border: '1px solid rgba(255,255,255,0.1)', color: '#F5F0E6' }} />
              <button type="button" disabled={running} onClick={() => void runResearch()} className="w-full py-2.5 rounded-lg text-sm font-semibold disabled:opacity-40" style={{ background: 'linear-gradient(90deg,#10b981,#22d3ee)', color: '#000' }}>
                {running ? phase || 'Running…' : 'Run research crew'}
              </button>
            </WidgetCard>
            <WidgetCard title="Live chart">
              {snap ? (<><MiniChart bars={snap.bars} /><div className="text-[11px] font-mono-data mt-2" style={{ color: 'rgba(255,255,255,0.5)' }}>Last {snap.last.toFixed(2)} · SMA20 {sma(snap.bars, 20)?.toFixed(2) ?? '—'} · RSI {rsi(snap.bars)?.toFixed(1) ?? '—'} · {snap.source}</div></>) : <p className="text-[11px]" style={{ color: 'rgba(255,255,255,0.35)' }}>Loading…</p>}
            </WidgetCard>
          </div>
        )}

        {tab === 'intel' && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
            <div className="space-y-1.5 max-h-[70vh] overflow-y-auto">
              {reports.filter(r => r.status !== 'archived').map(r => (
                <button key={r.id} type="button" onClick={() => setSelected(r)} className="w-full text-left rounded-xl px-3 py-2" style={{ border: selected?.id === r.id ? '1px solid rgba(34,211,238,0.3)' : '1px solid rgba(255,255,255,0.06)', background: 'rgba(255,255,255,0.02)' }}>
                  <div className="flex justify-between"><span className="font-mono-data text-sm" style={{ color: '#F5F0E6' }}>{r.ticker}</span><Badge signal={r.signal} /></div>
                  <p className="text-[11px] line-clamp-2 mt-1" style={{ color: 'rgba(255,255,255,0.45)' }}>{r.thesis}</p>
                </button>
              ))}
              {!reports.length && <p className="text-[11px]" style={{ color: 'rgba(255,255,255,0.35)' }}>No intel — run research.</p>}
            </div>
            {selected && (
              <WidgetCard title={`${selected.ticker} briefing`} headerAction={
                <button type="button" onClick={() => void deleteIntelReport(selected.id).then(reload)} style={{ color: '#f87171' }}>del</button>
              }>
                <Badge signal={selected.signal} />
                <p className="text-sm mt-2" style={{ color: 'rgba(245,240,230,0.85)' }}>{selected.thesis}</p>
                {selected.body && <pre className="text-[11px] mt-2 whitespace-pre-wrap max-h-[240px] overflow-y-auto p-2 rounded" style={{ background: '#0a0a0a', color: 'rgba(255,255,255,0.55)' }}>{selected.body}</pre>}
                <button type="button" className="mt-2 text-[11px]" style={{ color: '#34d399' }} onClick={() => { setTicker(selected.ticker); setTab('agent'); }}>→ Agent</button>
              </WidgetCard>
            )}
          </div>
        )}

        {tab === 'agent' && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
            <WidgetCard title="Trading agent" headerAction={<Bot size={13} style={{ color: '#a78bfa' }} />}>
              <input value={ticker} onChange={e => setTicker(e.target.value.toUpperCase())} className="w-full mb-2 rounded-lg px-3 py-2 text-sm font-mono-data outline-none" style={{ background: '#0a0a0a', border: '1px solid rgba(255,255,255,0.1)', color: '#F5F0E6' }} />
              <label className="flex items-center gap-2 text-[11px] mb-2" style={{ color: 'rgba(255,255,255,0.5)' }}>
                <input type="checkbox" checked={autoExec} onChange={e => setAutoExec(e.target.checked)} /> Auto-execute when risk allows
              </label>
              <button type="button" disabled={agentBusy} onClick={() => void runAgent()} className="w-full py-2.5 rounded-lg text-sm font-semibold disabled:opacity-40 flex items-center justify-center gap-2" style={{ background: 'linear-gradient(90deg,#a78bfa,#22d3ee)', color: '#000' }}>
                {agentBusy ? <Loader2 size={14} className="animate-spin" /> : <Play size={14} />}{agentBusy ? 'Thinking…' : 'Run agent'}
              </button>
              {rationale && <pre className="mt-2 text-[11px] whitespace-pre-wrap max-h-[100px] overflow-y-auto p-2 rounded" style={{ background: '#0a0a0a', color: 'rgba(255,255,255,0.55)' }}>{rationale}</pre>}
              {trace && (
                <div className="mt-2 space-y-1 max-h-[140px] overflow-y-auto">
                  <div className="text-[10px] uppercase" style={{ color: '#c4b5fd' }}>Decision journal</div>
                  {trace.steps.map(s => (
                    <div key={s.id} className="text-[10px] px-2 py-1 rounded" style={{ border: '1px solid rgba(167,139,250,0.2)' }}>
                      <span style={{ color: '#c4b5fd' }}>{s.phase}</span> · {s.title}
                      <div style={{ color: 'rgba(255,255,255,0.4)' }}>{s.detail}</div>
                    </div>
                  ))}
                </div>
              )}
              {risk && (
                <div className="mt-2 text-[10px] space-y-1" style={{ color: 'rgba(255,255,255,0.45)' }}>
                  <div className="flex flex-wrap gap-1">
                    {(['personal_demo', 'funded_challenge', 'funded_live_rules'] as const).map(m => (
                      <button key={m} type="button" onClick={() => void setRiskMode(m).then(setRisk)} className="px-1.5 py-0.5 rounded"
                        style={{ border: risk.mode === m ? '1px solid #34d399' : '1px solid rgba(255,255,255,0.12)', color: risk.mode === m ? '#34d399' : 'inherit' }}>{m.replace(/_/g, ' ')}</button>
                    ))}
                  </div>
                  <div>Risk/trade {(risk.riskPerTradePct * 100).toFixed(2)}% · min conf {(risk.minConfidence * 100).toFixed(0)}%</div>
                  {learning && <div>Learn winRate {(learning.winRate * 100).toFixed(0)}% · floor {learning.learnedMinConfidence.toFixed(2)}</div>}
                </div>
              )}
              <div className="mt-3 space-y-1.5" style={{ borderTop: '1px solid rgba(255,255,255,0.06)', paddingTop: 8 }}>
                <div className="text-[10px] uppercase" style={{ color: '#a5f3fc' }}>MetaAPI · MT5 demo (echte demo-orders)</div>
                <input value={metaAccountId} onChange={e => setMetaAccountId(e.target.value)} placeholder="MetaAPI account id"
                  className="w-full rounded px-2 py-1 text-[11px] outline-none font-mono-data"
                  style={{ background: '#0a0a0a', border: '1px solid rgba(255,255,255,0.1)', color: '#F5F0E6' }} />
                <input type="password" value={metaToken.startsWith('••••') ? '' : metaToken} onChange={e => setMetaToken(e.target.value)}
                  placeholder={metaToken.startsWith('••••') ? 'Token saved — paste new to replace' : 'MetaAPI token'}
                  className="w-full rounded px-2 py-1 text-[11px] outline-none"
                  style={{ background: '#0a0a0a', border: '1px solid rgba(255,255,255,0.1)', color: '#F5F0E6' }} />
                <div className="flex flex-wrap gap-2">
                  <button type="button" className="px-2 py-1 rounded text-[10px]" style={{ background: 'rgba(52,211,153,0.15)', color: '#34d399' }}
                    onClick={async () => {
                      if (!metaAccountId.trim()) { toast.error('Account id required'); return; }
                      const existing = await getMetaApiConfig();
                      const token = metaToken.startsWith('••••') ? (existing?.token || '') : metaToken.trim();
                      if (!token) { toast.error('Token required'); return; }
                      await saveMetaApiConfig({ token, accountId: metaAccountId.trim(), enabled: true, region: 'london' });
                      const probe = await metaApiGetAccount();
                      setMetaStatus(probe.ok ? `OK · ${probe.account.name || probe.account.connectionStatus || 'connected'}` : (probe.error || 'fail'));
                      if (probe.ok) toast.success('MetaAPI connected — agent orders go to MT5');
                      else toast.error('MetaAPI', { description: probe.error });
                      setBroker(await connectBrokerKind('mt5_demo'));
                      await reload();
                    }}>Save & test MetaAPI</button>
                  <button type="button" className="underline text-[10px]" onClick={() => void connectBrokerKind('paper_live_prices').then(setBroker)}>Paper only</button>
                </div>
                {metaStatus && <div className="text-[10px]" style={{ color: 'rgba(255,255,255,0.4)' }}>{metaStatus}</div>}
                {broker && <div className="text-[10px]" style={{ color: '#a5f3fc' }}>Broker: {broker.label}{broker.connected ? ' · order path active' : ''}</div>}
              </div>
            </WidgetCard>
            <WidgetCard title="Agent memory">
              <div className="space-y-1 max-h-[400px] overflow-y-auto">
                {!mem.length && <p className="text-[11px]" style={{ color: 'rgba(255,255,255,0.35)' }}>Empty — run agent.</p>}
                {mem.map(m => (
                  <div key={m.key} className="text-[10px] px-2 py-1 rounded" style={{ border: '1px solid rgba(255,255,255,0.06)' }}>
                    <div style={{ color: '#f472b6' }}>{m.key.replace(/^ta:[^:]+:/, '')}</div>
                    <div style={{ color: 'rgba(255,255,255,0.45)' }} className="line-clamp-3">{m.value.slice(0, 240)}</div>
                  </div>
                ))}
              </div>
            </WidgetCard>
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
            <div className="text-[10px] uppercase mb-1" style={{ color: 'rgba(255,255,255,0.35)' }}>Positions</div>
            {!account.positions.length && <p className="text-[11px]" style={{ color: 'rgba(255,255,255,0.35)' }}>Flat</p>}
            {account.positions.map(p => (
              <div key={p.symbol} className="flex justify-between text-[12px] font-mono-data" style={{ color: '#F5F0E6' }}>
                <span>{p.symbol}</span><span>{p.qty} @ {p.avgPrice.toFixed(2)}</span>
              </div>
            ))}
            <div className="text-[10px] uppercase mt-3 mb-1" style={{ color: 'rgba(255,255,255,0.35)' }}>Fills</div>
            <div className="max-h-[200px] overflow-y-auto space-y-1">
              {account.trades.slice(0, 25).map(t => (
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
