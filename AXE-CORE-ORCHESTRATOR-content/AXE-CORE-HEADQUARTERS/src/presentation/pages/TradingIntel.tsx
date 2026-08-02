/**
 * Trading Intel — professional research desk for AXE CORE.
 * Multi-agent pipeline inspired by TauricResearch/TradingAgents (arXiv:2412.20138).
 * Stores briefings locally + settings mirror; optional CrewAI dispatch.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Activity,
  Archive,
  BookOpen,
  ExternalLink,
  LineChart,
  Loader2,
  Plus,
  RefreshCw,
  Search,
  Shield,
  Sparkles,
  Target,
  Trash2,
  TrendingUp,
  Users,
  Radar,
  Star,
} from 'lucide-react';
import { WidgetCard } from '@/presentation/components/widgets/WidgetCard';
import {
  AGENT_CATALOG,
  SIGNAL_META,
  type TradingIntelReport,
  type TradingSignal,
} from '@/domain/tradingIntel/types';
import {
  addToWatchlist,
  deleteIntelReport,
  listIntelReports,
  listWatchlist,
  removeFromWatchlist,
  summarizeIntel,
  type TradingIntelWatchlistItem,
  upsertIntelReport,
} from '@/infrastructure/persistence/tradingIntelService';
import { runTradingResearch } from '@/application/tradingIntel/runTradingResearch';
import { isAxeApiConfigured } from '@/infrastructure/gateways/axeCoreApiService';
import { toast } from 'sonner';

type TabId = 'desk' | 'reports' | 'pipeline' | 'watchlist' | 'sources';

const TABS: { id: TabId; label: string; icon: typeof Radar }[] = [
  { id: 'desk', label: 'Research Desk', icon: Radar },
  { id: 'reports', label: 'Intel Reports', icon: BookOpen },
  { id: 'pipeline', label: 'Agent Pipeline', icon: Users },
  { id: 'watchlist', label: 'Watchlist', icon: Star },
  { id: 'sources', label: 'Framework', icon: Shield },
];

function SignalBadge({ signal }: { signal: TradingSignal }) {
  const m = SIGNAL_META[signal];
  return (
    <span
      className="text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-full"
      style={{ color: m.color, background: m.bg, border: `1px solid ${m.color}33` }}
    >
      {m.label}
    </span>
  );
}

function pct(n: number) {
  return `${Math.round(n * 100)}%`;
}

export default function TradingIntel() {
  const [tab, setTab] = useState<TabId>('desk');
  const [reports, setReports] = useState<TradingIntelReport[]>([]);
  const [watch, setWatch] = useState<TradingIntelWatchlistItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [ticker, setTicker] = useState('BTC-USD');
  const [notes, setNotes] = useState('');
  const [horizon, setHorizon] = useState('swing');
  const [useCrew, setUseCrew] = useState(false);
  const [running, setRunning] = useState(false);
  const [phase, setPhase] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [filterSignal, setFilterSignal] = useState<TradingSignal | 'all'>('all');
  const [query, setQuery] = useState('');
  const [watchTicker, setWatchTicker] = useState('');

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const [r, w] = await Promise.all([listIntelReports(), listWatchlist()]);
      setReports(r);
      setWatch(w);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  const stats = useMemo(() => summarizeIntel(reports, watch.length), [reports, watch]);
  const selected = useMemo(
    () => reports.find(r => r.id === selectedId) ?? reports[0] ?? null,
    [reports, selectedId],
  );

  const filtered = useMemo(() => {
    return reports.filter(r => {
      if (r.status === 'archived') return false;
      if (filterSignal !== 'all' && r.signal !== filterSignal) return false;
      if (query.trim()) {
        const q = query.toLowerCase();
        return (
          r.ticker.toLowerCase().includes(q) ||
          (r.name || '').toLowerCase().includes(q) ||
          r.thesis.toLowerCase().includes(q) ||
          r.tags.some(t => t.includes(q))
        );
      }
      return true;
    });
  }, [reports, filterSignal, query]);

  const runDesk = async () => {
    if (!ticker.trim()) return;
    setRunning(true);
    setPhase('Starting desk…');
    try {
      const report = await runTradingResearch({
        ticker,
        notes,
        horizon,
        useCrew: useCrew && isAxeApiConfigured,
        onProgress: (p, d) => setPhase(d || p),
      });
      toast.success(`Intel ready · ${report.ticker}`, {
        description: `${report.signal} · ${pct(report.confidence)} confidence`,
      });
      setSelectedId(report.id);
      setTab('reports');
      await reload();
    } catch (e) {
      toast.error('Research failed', {
        description: e instanceof Error ? e.message : String(e),
      });
    } finally {
      setRunning(false);
      setPhase('');
    }
  };

  const removeReport = async (id: string) => {
    await deleteIntelReport(id);
    if (selectedId === id) setSelectedId(null);
    await reload();
  };

  const archiveReport = async (id: string) => {
    const r = reports.find(x => x.id === id);
    if (!r) return;
    await upsertIntelReport({ ...r, status: 'archived' });
    await reload();
  };

  const addWatch = async () => {
    if (!watchTicker.trim()) return;
    await addToWatchlist({ ticker: watchTicker });
    setWatchTicker('');
    await reload();
  };

  return (
    <motion.div
      className="h-full flex flex-col min-h-0"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      style={{ background: '#000' }}
    >
      {/* Header */}
      <div
        className="flex-shrink-0 px-4 sm:px-5 pt-4 pb-3"
        style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}
      >
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <div
                className="w-7 h-7 rounded-lg flex items-center justify-center"
                style={{
                  background: 'linear-gradient(135deg, rgba(16,185,129,0.2), rgba(34,211,238,0.15))',
                  border: '1px solid rgba(16,185,129,0.35)',
                }}
              >
                <LineChart size={14} style={{ color: '#34d399' }} />
              </div>
              <h1 className="text-page-title font-semibold" style={{ color: '#F5F0E6' }}>
                Trading Intel
              </h1>
              <span
                className="text-[9px] uppercase tracking-widest px-1.5 py-0.5 rounded"
                style={{
                  color: 'rgba(52,211,153,0.9)',
                  border: '1px solid rgba(52,211,153,0.25)',
                  background: 'rgba(52,211,153,0.06)',
                }}
              >
                Research Desk
              </span>
            </div>
            <p className="text-xs-custom max-w-2xl" style={{ color: 'rgba(255,255,255,0.45)' }}>
              Multi-agent trading research — analysts, bull/bear debate, risk, and portfolio decision.
              Inspired by{' '}
              <a
                href="https://github.com/TauricResearch/TradingAgents"
                target="_blank"
                rel="noreferrer"
                className="underline underline-offset-2"
                style={{ color: '#22d3ee' }}
              >
                TauricResearch/TradingAgents
              </a>{' '}
              (arXiv:2412.20138). Intel is stored and reusable by CrewAI / AXE.
            </p>
          </div>
          <button
            type="button"
            onClick={() => void reload()}
            className="self-start flex items-center gap-1.5 text-[11px] px-2.5 py-1.5 rounded-md"
            style={{
              color: 'rgba(255,255,255,0.5)',
              border: '1px solid rgba(255,255,255,0.08)',
              background: 'rgba(255,255,255,0.03)',
            }}
          >
            <RefreshCw size={12} className={loading ? 'animate-spin' : ''} />
            Refresh
          </button>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 mt-3">
          {[
            { label: 'Reports', value: stats.total, color: '#22d3ee', icon: BookOpen },
            { label: 'Complete', value: stats.complete, color: '#34d399', icon: Target },
            { label: 'Buy signals', value: stats.bySignal.BUY, color: '#10b981', icon: TrendingUp },
            { label: 'Watchlist', value: stats.watchCount, color: '#fbbf24', icon: Star },
            { label: 'Latest', value: stats.latestAsOf || '—', color: '#a78bfa', icon: Activity },
          ].map(c => {
            const Icon = c.icon;
            return (
              <div
                key={c.label}
                className="rounded-xl px-3 py-2"
                style={{
                  background: 'rgba(255,255,255,0.02)',
                  border: '1px solid rgba(255,255,255,0.06)',
                }}
              >
                <div className="flex items-center gap-1.5 mb-0.5">
                  <Icon size={11} style={{ color: c.color }} />
                  <span className="text-[9px] uppercase tracking-wider" style={{ color: 'rgba(255,255,255,0.35)' }}>
                    {c.label}
                  </span>
                </div>
                <div className="text-lg font-semibold font-mono-data" style={{ color: c.color }}>
                  {c.value}
                </div>
              </div>
            );
          })}
        </div>

        {/* Tabs */}
        <div className="flex gap-1 mt-3 overflow-x-auto">
          {TABS.map(t => {
            const Icon = t.icon;
            const active = tab === t.id;
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => setTab(t.id)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] whitespace-nowrap transition-colors"
                style={{
                  color: active ? '#a5f3fc' : 'rgba(255,255,255,0.4)',
                  background: active ? 'rgba(34,211,238,0.1)' : 'transparent',
                  border: active ? '1px solid rgba(34,211,238,0.25)' : '1px solid transparent',
                }}
              >
                <Icon size={12} />
                {t.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Body */}
      <div className="flex-1 min-h-0 overflow-y-auto p-4 sm:p-5">
        <AnimatePresence mode="wait">
          {tab === 'desk' && (
            <motion.div
              key="desk"
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className="grid grid-cols-1 xl:grid-cols-5 gap-4"
            >
              <div className="xl:col-span-2 space-y-3">
                <WidgetCard title="Run research" headerAction={<Sparkles size={13} style={{ color: '#34d399' }} />}>
                  <div className="space-y-3">
                    <div>
                      <label className="text-[10px] uppercase tracking-wider" style={{ color: 'rgba(255,255,255,0.35)' }}>
                        Ticker
                      </label>
                      <input
                        value={ticker}
                        onChange={e => setTicker(e.target.value.toUpperCase())}
                        placeholder="BTC-USD / AAPL / ETH-USD"
                        className="w-full mt-1 rounded-lg px-3 py-2 text-sm font-mono-data outline-none"
                        style={{
                          background: 'rgba(0,0,0,0.5)',
                          border: '1px solid rgba(255,255,255,0.1)',
                          color: '#F5F0E6',
                        }}
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="text-[10px] uppercase tracking-wider" style={{ color: 'rgba(255,255,255,0.35)' }}>
                          Horizon
                        </label>
                        <select
                          value={horizon}
                          onChange={e => setHorizon(e.target.value)}
                          className="w-full mt-1 rounded-lg px-2 py-2 text-sm outline-none"
                          style={{
                            background: 'rgba(0,0,0,0.5)',
                            border: '1px solid rgba(255,255,255,0.1)',
                            color: '#F5F0E6',
                          }}
                        >
                          <option value="scalp">Scalp</option>
                          <option value="intraday">Intraday</option>
                          <option value="swing">Swing</option>
                          <option value="position">Position</option>
                        </select>
                      </div>
                      <div className="flex items-end">
                        <label className="flex items-center gap-2 text-[11px] cursor-pointer pb-2" style={{ color: 'rgba(255,255,255,0.55)' }}>
                          <input
                            type="checkbox"
                            checked={useCrew}
                            onChange={e => setUseCrew(e.target.checked)}
                            disabled={!isAxeApiConfigured}
                          />
                          Use CrewAI {isAxeApiConfigured ? '' : '(API off)'}
                        </label>
                      </div>
                    </div>
                    <div>
                      <label className="text-[10px] uppercase tracking-wider" style={{ color: 'rgba(255,255,255,0.35)' }}>
                        Context / thesis notes
                      </label>
                      <textarea
                        value={notes}
                        onChange={e => setNotes(e.target.value)}
                        rows={4}
                        placeholder="Catalysts, levels, questions for the desk…"
                        className="w-full mt-1 rounded-lg px-3 py-2 text-sm outline-none resize-none"
                        style={{
                          background: 'rgba(0,0,0,0.5)',
                          border: '1px solid rgba(255,255,255,0.1)',
                          color: '#F5F0E6',
                        }}
                      />
                    </div>
                    <button
                      type="button"
                      disabled={running || !ticker.trim()}
                      onClick={() => void runDesk()}
                      className="w-full flex items-center justify-center gap-2 rounded-lg py-2.5 text-sm font-semibold disabled:opacity-40"
                      style={{
                        background: 'linear-gradient(90deg, rgba(16,185,129,0.9), rgba(34,211,238,0.85))',
                        color: '#000',
                      }}
                    >
                      {running ? <Loader2 size={15} className="animate-spin" /> : <Radar size={15} />}
                      {running ? phase || 'Running desk…' : 'Run multi-agent research'}
                    </button>
                    <p className="text-[10px] leading-relaxed" style={{ color: 'rgba(255,255,255,0.3)' }}>
                      Pipeline: Market → Fundamentals → News → Sentiment → Bull/Bear → Research Mgr →
                      Trader → Risk trio → Portfolio Manager. Results are saved as Intel Reports.
                    </p>
                  </div>
                </WidgetCard>
              </div>

              <div className="xl:col-span-3 space-y-3">
                <WidgetCard title="Live pipeline" headerAction={<Users size={13} style={{ color: '#a78bfa' }} />}>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {AGENT_CATALOG.map(a => (
                      <div
                        key={a.role}
                        className="rounded-lg px-3 py-2"
                        style={{
                          border: `1px solid ${a.color}22`,
                          background: `${a.color}08`,
                        }}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-[12px] font-medium" style={{ color: a.color }}>
                            {a.label}
                          </span>
                          <span className="text-[9px] uppercase" style={{ color: 'rgba(255,255,255,0.3)' }}>
                            {a.team}
                          </span>
                        </div>
                        <p className="text-[10px] mt-0.5" style={{ color: 'rgba(255,255,255,0.4)' }}>
                          {a.description}
                        </p>
                      </div>
                    ))}
                  </div>
                </WidgetCard>
              </div>
            </motion.div>
          )}

          {tab === 'reports' && (
            <motion.div
              key="reports"
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className="grid grid-cols-1 lg:grid-cols-5 gap-4 h-full"
            >
              <div className="lg:col-span-2 space-y-2">
                <div className="flex gap-2">
                  <div className="relative flex-1">
                    <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2" style={{ color: 'rgba(255,255,255,0.3)' }} />
                    <input
                      value={query}
                      onChange={e => setQuery(e.target.value)}
                      placeholder="Search ticker, thesis…"
                      className="w-full rounded-lg pl-8 pr-3 py-2 text-sm outline-none"
                      style={{
                        background: 'rgba(255,255,255,0.03)',
                        border: '1px solid rgba(255,255,255,0.08)',
                        color: '#F5F0E6',
                      }}
                    />
                  </div>
                  <select
                    value={filterSignal}
                    onChange={e => setFilterSignal(e.target.value as TradingSignal | 'all')}
                    className="rounded-lg px-2 text-[11px] outline-none"
                    style={{
                      background: 'rgba(255,255,255,0.03)',
                      border: '1px solid rgba(255,255,255,0.08)',
                      color: '#F5F0E6',
                    }}
                  >
                    <option value="all">All signals</option>
                    {Object.keys(SIGNAL_META).map(s => (
                      <option key={s} value={s}>{s}</option>
                    ))}
                  </select>
                </div>

                <div className="space-y-1.5 max-h-[60vh] overflow-y-auto pr-1">
                  {loading && (
                    <div className="text-[11px] py-8 text-center" style={{ color: 'rgba(255,255,255,0.35)' }}>
                      Loading intel…
                    </div>
                  )}
                  {!loading && filtered.length === 0 && (
                    <div className="text-[11px] py-8 text-center" style={{ color: 'rgba(255,255,255,0.35)' }}>
                      No reports yet. Run research from the Desk.
                    </div>
                  )}
                  {filtered.map(r => {
                    const active = selected?.id === r.id;
                    return (
                      <button
                        key={r.id}
                        type="button"
                        onClick={() => setSelectedId(r.id)}
                        className="w-full text-left rounded-xl px-3 py-2.5 transition-colors"
                        style={{
                          background: active ? 'rgba(34,211,238,0.08)' : 'rgba(255,255,255,0.02)',
                          border: active
                            ? '1px solid rgba(34,211,238,0.28)'
                            : '1px solid rgba(255,255,255,0.06)',
                        }}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-mono-data text-sm font-semibold" style={{ color: '#F5F0E6' }}>
                            {r.ticker}
                          </span>
                          <SignalBadge signal={r.signal} />
                        </div>
                        <div className="flex items-center gap-2 mt-1 text-[10px]" style={{ color: 'rgba(255,255,255,0.35)' }}>
                          <span>{r.asOf}</span>
                          <span>·</span>
                          <span>{pct(r.confidence)}</span>
                          <span>·</span>
                          <span className="capitalize">{r.source.replace('_', ' ')}</span>
                        </div>
                        <p className="text-[11px] mt-1 line-clamp-2" style={{ color: 'rgba(255,255,255,0.45)' }}>
                          {r.thesis || '—'}
                        </p>
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="lg:col-span-3">
                {selected ? (
                  <WidgetCard
                    title={`${selected.ticker} · Intel briefing`}
                    headerAction={
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          title="Archive"
                          onClick={() => void archiveReport(selected.id)}
                          className="p-1 rounded"
                          style={{ color: 'rgba(255,255,255,0.35)' }}
                        >
                          <Archive size={13} />
                        </button>
                        <button
                          type="button"
                          title="Delete"
                          onClick={() => void removeReport(selected.id)}
                          className="p-1 rounded"
                          style={{ color: 'rgba(248,113,113,0.7)' }}
                        >
                          <Trash2 size={13} />
                        </button>
                      </div>
                    }
                  >
                    <div className="space-y-4">
                      <div className="flex flex-wrap items-center gap-2">
                        <SignalBadge signal={selected.signal} />
                        <span className="text-[11px] font-mono-data" style={{ color: '#a5f3fc' }}>
                          {pct(selected.confidence)} confidence
                        </span>
                        <span className="text-[10px]" style={{ color: 'rgba(255,255,255,0.3)' }}>
                          {selected.horizon || '—'} · {selected.assetClass} · {selected.status}
                        </span>
                      </div>

                      <div>
                        <div className="text-[10px] uppercase tracking-wider mb-1" style={{ color: 'rgba(255,255,255,0.35)' }}>
                          Thesis
                        </div>
                        <p className="text-sm leading-relaxed" style={{ color: 'rgba(245,240,230,0.85)' }}>
                          {selected.thesis}
                        </p>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div>
                          <div className="text-[10px] uppercase tracking-wider mb-1" style={{ color: 'rgba(248,113,113,0.8)' }}>
                            Risks
                          </div>
                          <ul className="space-y-1">
                            {(selected.risks.length ? selected.risks : ['—']).map((x, i) => (
                              <li key={i} className="text-[11px]" style={{ color: 'rgba(255,255,255,0.5)' }}>· {x}</li>
                            ))}
                          </ul>
                        </div>
                        <div>
                          <div className="text-[10px] uppercase tracking-wider mb-1" style={{ color: 'rgba(52,211,153,0.8)' }}>
                            Catalysts
                          </div>
                          <ul className="space-y-1">
                            {(selected.catalysts.length ? selected.catalysts : ['—']).map((x, i) => (
                              <li key={i} className="text-[11px]" style={{ color: 'rgba(255,255,255,0.5)' }}>· {x}</li>
                            ))}
                          </ul>
                        </div>
                      </div>

                      {selected.agents.length > 0 && (
                        <div>
                          <div className="text-[10px] uppercase tracking-wider mb-2" style={{ color: 'rgba(255,255,255,0.35)' }}>
                            Agent briefs ({selected.agents.length})
                          </div>
                          <div className="space-y-2 max-h-[280px] overflow-y-auto pr-1">
                            {selected.agents.map(a => {
                              const color = AGENT_CATALOG.find(c => c.role === a.role)?.color || '#94a3b8';
                              return (
                                <div
                                  key={a.role}
                                  className="rounded-lg px-3 py-2"
                                  style={{ border: `1px solid ${color}25`, background: `${color}08` }}
                                >
                                  <div className="flex items-center justify-between gap-2">
                                    <span className="text-[12px] font-medium" style={{ color }}>{a.label}</span>
                                    <span className="text-[10px]" style={{ color: 'rgba(255,255,255,0.4)' }}>
                                      {a.stance} · {pct(a.confidence)}
                                    </span>
                                  </div>
                                  <p className="text-[11px] mt-1" style={{ color: 'rgba(255,255,255,0.55)' }}>{a.summary}</p>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      )}

                      {selected.body && (
                        <div>
                          <div className="text-[10px] uppercase tracking-wider mb-1" style={{ color: 'rgba(255,255,255,0.35)' }}>
                            Full briefing
                          </div>
                          <pre
                            className="text-[11px] whitespace-pre-wrap rounded-lg p-3 max-h-[240px] overflow-y-auto font-mono-data"
                            style={{
                              background: 'rgba(0,0,0,0.4)',
                              border: '1px solid rgba(255,255,255,0.06)',
                              color: 'rgba(245,240,230,0.7)',
                            }}
                          >
                            {selected.body}
                          </pre>
                        </div>
                      )}
                    </div>
                  </WidgetCard>
                ) : (
                  <div className="h-40 flex items-center justify-center text-[12px]" style={{ color: 'rgba(255,255,255,0.35)' }}>
                    Select a report
                  </div>
                )}
              </div>
            </motion.div>
          )}

          {tab === 'pipeline' && (
            <motion.div key="pipeline" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-4">
              <WidgetCard title="TradingAgents pipeline (mapped into AXE)">
                <p className="text-[12px] mb-3" style={{ color: 'rgba(255,255,255,0.45)' }}>
                  Flow matches the academic multi-agent design: specialized analysts feed a bull/bear debate,
                  research management synthesizes, the trader proposes, risk agents stress-test, portfolio manager decides.
                </p>
                <div className="flex flex-wrap gap-2 items-center text-[11px]">
                  {['Analysts', 'Bull vs Bear', 'Research Mgr', 'Trader', 'Risk panel', 'Portfolio Mgr'].map((step, i) => (
                    <div key={step} className="flex items-center gap-2">
                      <span
                        className="px-2.5 py-1 rounded-full"
                        style={{
                          background: 'rgba(34,211,238,0.08)',
                          border: '1px solid rgba(34,211,238,0.2)',
                          color: '#a5f3fc',
                        }}
                      >
                        {step}
                      </span>
                      {i < 5 && <span style={{ color: 'rgba(255,255,255,0.2)' }}>→</span>}
                    </div>
                  ))}
                </div>
              </WidgetCard>
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
                {(['analysts', 'researchers', 'managers', 'trader', 'risk'] as const).map(team => (
                  <WidgetCard key={team} title={team.charAt(0).toUpperCase() + team.slice(1)}>
                    <div className="space-y-2">
                      {AGENT_CATALOG.filter(a => a.team === team).map(a => (
                        <div key={a.role} className="text-[11px]">
                          <div style={{ color: a.color }} className="font-medium">{a.label}</div>
                          <div style={{ color: 'rgba(255,255,255,0.4)' }}>{a.description}</div>
                        </div>
                      ))}
                    </div>
                  </WidgetCard>
                ))}
              </div>
            </motion.div>
          )}

          {tab === 'watchlist' && (
            <motion.div key="watch" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="max-w-xl space-y-3">
              <WidgetCard title="Watchlist">
                <div className="flex gap-2 mb-3">
                  <input
                    value={watchTicker}
                    onChange={e => setWatchTicker(e.target.value.toUpperCase())}
                    placeholder="Add ticker…"
                    className="flex-1 rounded-lg px-3 py-2 text-sm font-mono-data outline-none"
                    style={{
                      background: 'rgba(0,0,0,0.4)',
                      border: '1px solid rgba(255,255,255,0.1)',
                      color: '#F5F0E6',
                    }}
                    onKeyDown={e => {
                      if (e.key === 'Enter') void addWatch();
                    }}
                  />
                  <button
                    type="button"
                    onClick={() => void addWatch()}
                    className="px-3 rounded-lg flex items-center gap-1 text-sm font-medium"
                    style={{ background: 'rgba(34,211,238,0.15)', color: '#a5f3fc' }}
                  >
                    <Plus size={14} /> Add
                  </button>
                </div>
                <div className="space-y-1.5">
                  {watch.length === 0 && (
                    <p className="text-[11px]" style={{ color: 'rgba(255,255,255,0.35)' }}>Empty — add tickers to track.</p>
                  )}
                  {watch.map(w => (
                    <div
                      key={w.ticker}
                      className="flex items-center justify-between rounded-lg px-3 py-2"
                      style={{ border: '1px solid rgba(255,255,255,0.06)', background: 'rgba(255,255,255,0.02)' }}
                    >
                      <div>
                        <div className="font-mono-data text-sm" style={{ color: '#F5F0E6' }}>{w.ticker}</div>
                        <div className="text-[10px]" style={{ color: 'rgba(255,255,255,0.35)' }}>
                          {w.assetClass} · added {w.addedAt.slice(0, 10)}
                        </div>
                      </div>
                      <div className="flex gap-1">
                        <button
                          type="button"
                          className="text-[10px] px-2 py-1 rounded"
                          style={{ color: '#34d399', border: '1px solid rgba(52,211,153,0.25)' }}
                          onClick={() => {
                            setTicker(w.ticker);
                            setTab('desk');
                          }}
                        >
                          Research
                        </button>
                        <button
                          type="button"
                          className="p-1 rounded"
                          style={{ color: 'rgba(248,113,113,0.7)' }}
                          onClick={() => void removeFromWatchlist(w.ticker).then(reload)}
                        >
                          <Trash2 size={13} />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </WidgetCard>
            </motion.div>
          )}

          {tab === 'sources' && (
            <motion.div key="src" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="grid grid-cols-1 md:grid-cols-2 gap-4 max-w-4xl">
              <WidgetCard title="TauricResearch · TradingAgents">
                <p className="text-[12px] leading-relaxed mb-3" style={{ color: 'rgba(255,255,255,0.5)' }}>
                  Multi-Agents LLM Financial Trading Framework. AXE Trading Intel maps the same roles
                  (analysts, researchers, trader, risk, portfolio manager) into a stored research desk
                  you can run from HQ and feed into CrewAI.
                </p>
                <div className="flex flex-col gap-2">
                  <a
                    href="https://github.com/TauricResearch/TradingAgents"
                    target="_blank"
                    rel="noreferrer"
                    className="flex items-center gap-2 text-[12px]"
                    style={{ color: '#22d3ee' }}
                  >
                    <ExternalLink size={12} /> github.com/TauricResearch/TradingAgents
                  </a>
                  <a
                    href="https://arxiv.org/abs/2412.20138"
                    target="_blank"
                    rel="noreferrer"
                    className="flex items-center gap-2 text-[12px]"
                    style={{ color: '#f59e0b' }}
                  >
                    <ExternalLink size={12} /> arXiv:2412.20138
                  </a>
                  <a
                    href="https://arxiv.org/pdf/2412.20138"
                    target="_blank"
                    rel="noreferrer"
                    className="flex items-center gap-2 text-[12px]"
                    style={{ color: 'rgba(255,255,255,0.45)' }}
                  >
                    <ExternalLink size={12} /> PDF paper
                  </a>
                </div>
              </WidgetCard>
              <WidgetCard title="How AXE uses this">
                <ul className="space-y-2 text-[12px]" style={{ color: 'rgba(255,255,255,0.5)' }}>
                  <li>· <strong style={{ color: '#a5f3fc' }}>Research Desk</strong> — run multi-agent briefing on any ticker</li>
                  <li>· <strong style={{ color: '#a5f3fc' }}>Intel Reports</strong> — durable storage (local + settings sync)</li>
                  <li>· <strong style={{ color: '#a5f3fc' }}>CrewAI toggle</strong> — optional VPS crew synthesis when API is up</li>
                  <li>· <strong style={{ color: '#a5f3fc' }}>Watchlist</strong> — queue for next research cycles</li>
                  <li>· <strong style={{ color: '#a5f3fc' }}>Trading tab</strong> — execution UIs (TradingOS / Krypt) stay separate</li>
                </ul>
                <p className="text-[10px] mt-3" style={{ color: 'rgba(255,255,255,0.28)' }}>
                  Not financial advice. Desk output is decision support only.
                </p>
              </WidgetCard>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </motion.div>
  );
}
