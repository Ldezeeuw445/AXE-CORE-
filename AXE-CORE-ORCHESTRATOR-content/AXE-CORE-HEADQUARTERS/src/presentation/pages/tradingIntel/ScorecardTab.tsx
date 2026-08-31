/**
 * ScorecardTab — how good is he actually getting. Three parts:
 *  1) Live learning stats from the decision loop.
 *  2) "His own book" — REAL closed-trade history. When MetaAPI is
 *     connected, this is the actual MT5 account's history-deals (the real
 *     account, e.g. an OANDA demo — not AXE's internal mock), normalized
 *     the same way AXE Companion does it. Falls back to the internal paper
 *     book only when no MetaAPI account is connected.
 *  3) The CSV journal — drop any broker's trade-history export and get the
 *     same instant analytics for outside accounts. Nothing like this
 *     exists in AXE Companion (its journal is tag-completion stats only,
 *     see csvJournalAnalytics.ts) — this is new.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { UploadCloud, X } from 'lucide-react';
import { WidgetCard } from '@/presentation/components/widgets/WidgetCard';
import { loadSetting, saveSetting } from '@/infrastructure/persistence/userSettingsService';
import {
  parseJournalCsv,
  computeJournalAnalytics,
  type JournalTrade,
  type JournalAnalytics,
} from '@/application/tradingIntel/csvJournalAnalytics';
import { OWN_BOOK_LOOKBACK_DAYS, type TradingDeskState } from './useTradingDeskState';
import { StrategyLedgerPanel } from './StrategyLedgerPanel';

const LAST_IMPORT_KEY = 'axe_trading_journal_last_import';

function StatTile({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div className="rounded-lg p-2.5" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}>
      <div className="text-[9px] uppercase tracking-wider" style={{ color: 'rgba(255,255,255,0.35)' }}>{label}</div>
      <div className="text-[15px] font-mono-data mt-0.5" style={{ color: color || '#F5F0E6' }}>{value}</div>
    </div>
  );
}

function EquityCurveSvg({ curve }: { curve: JournalAnalytics['equityCurve'] }) {
  if (curve.length < 2) return null;
  const w = 640;
  const h = 120;
  const values = curve.map(p => p.equity);
  const min = Math.min(0, ...values);
  const max = Math.max(0, ...values);
  const range = max - min || 1;
  const points = curve.map((p, i) => {
    const x = (i / (curve.length - 1)) * w;
    const y = h - ((p.equity - min) / range) * h;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(' ');
  const zeroY = h - ((0 - min) / range) * h;
  const positive = values[values.length - 1] >= 0;
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="w-full h-[120px]" preserveAspectRatio="none">
      <line x1={0} y1={zeroY} x2={w} y2={zeroY} stroke="rgba(255,255,255,0.15)" strokeDasharray="4 4" />
      <polyline points={points} fill="none" stroke={positive ? 'var(--success)' : 'var(--error)'} strokeWidth={1.5} />
    </svg>
  );
}

function Breakdown({ title, rows }: { title: string; rows: { label: string; trades: number; netProfit: number; winRate: number }[] }) {
  if (!rows.length) return null;
  return (
    <div>
      <p className="text-[10px] uppercase tracking-wider mb-1" style={{ color: 'rgba(255,255,255,0.35)' }}>{title}</p>
      <div className="space-y-1">
        {rows.slice(0, 12).map(r => (
          <div key={r.label} className="flex items-center justify-between text-[11px] font-mono-data">
            <span style={{ color: '#F5F0E6' }}>{r.label}</span>
            <span style={{ color: 'rgba(255,255,255,0.4)' }}>{r.trades} trades · {(r.winRate * 100).toFixed(0)}% win</span>
            <span style={{ color: r.netProfit >= 0 ? '#6ee7b7' : '#fca5a5' }}>{r.netProfit >= 0 ? '+' : ''}{r.netProfit.toFixed(2)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

/** The scoreboard — every (strategy, symbol) combination actually traded,
 *  ranked by net profit. Answers "is Golden Pocket working on XAUUSD
 *  specifically" without cross-referencing two separate breakdowns. */
function Scoreboard({ rows }: { rows: JournalAnalytics['byStrategyAndSymbol'] }) {
  if (!rows.length) return null;
  const sorted = [...rows].sort((a, b) => b.netProfit - a.netProfit);
  return (
    <div>
      <p className="text-[10px] uppercase tracking-wider mb-1" style={{ color: 'rgba(255,255,255,0.35)' }}>Scoreboard — strategy × pair</p>
      <div className="rounded-lg overflow-hidden" style={{ border: '1px solid rgba(255,255,255,0.06)' }}>
        <div className="grid gap-2 [grid-template-columns:repeat(auto-fill,minmax(190px,1fr))] px-2 py-1.5 text-[9px] uppercase tracking-wide" style={{ background: 'rgba(255,255,255,0.03)', color: 'rgba(255,255,255,0.35)' }}>
          <span className="col-span-2">Strategy</span>
          <span>Pair</span>
          <span className="text-right">Win rate</span>
          <span className="text-right">Net</span>
        </div>
        {sorted.slice(0, 20).map((r, i) => (
          <div
            key={`${r.strategy}-${r.symbol}`}
            className="grid gap-2 [grid-template-columns:repeat(auto-fill,minmax(190px,1fr))] px-2 py-1.5 text-[11px] font-mono-data"
            style={{ background: i % 2 ? 'rgba(255,255,255,0.015)' : 'transparent' }}
          >
            <span className="col-span-2 truncate" style={{ color: '#F5F0E6' }}>{r.strategy}</span>
            <span style={{ color: 'rgba(255,255,255,0.55)' }}>{r.symbol}</span>
            <span className="text-right" style={{ color: r.winRate >= 0.5 ? '#6ee7b7' : '#fca5a5' }}>{(r.winRate * 100).toFixed(0)}% ({r.trades})</span>
            <span className="text-right" style={{ color: r.netProfit >= 0 ? '#6ee7b7' : '#fca5a5' }}>{r.netProfit >= 0 ? '+' : ''}{r.netProfit.toFixed(2)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

/** Shared render for any computed JournalAnalytics, whether it came from the
 *  agent's own book or an uploaded CSV. */
function AnalyticsPanel({ analytics, byStrategyHint }: { analytics: JournalAnalytics; byStrategyHint?: string }) {
  return (
    <div className="space-y-4">
      <div className="grid gap-2 [grid-template-columns:repeat(auto-fill,minmax(230px,1fr))]">
        <StatTile label="Net profit" value={`${analytics.netProfit >= 0 ? '+' : ''}${analytics.netProfit.toFixed(2)}`} color={analytics.netProfit >= 0 ? '#6ee7b7' : '#fca5a5'} />
        <StatTile label="Win rate" value={`${(analytics.winRate * 100).toFixed(0)}% (${analytics.wins}/${analytics.totalTrades})`} color={analytics.winRate >= 0.5 ? '#6ee7b7' : '#fca5a5'} />
        <StatTile label="Profit factor" value={Number.isFinite(analytics.profitFactor) ? analytics.profitFactor.toFixed(2) : '∞'} />
        <StatTile label="Max drawdown" value={`-${analytics.maxDrawdown.toFixed(2)} (${(analytics.maxDrawdownPct * 100).toFixed(1)}%)`} color="#fca5a5" />
        <StatTile label="Avg win" value={`+${analytics.avgWin.toFixed(2)}`} color="#6ee7b7" />
        <StatTile label="Avg loss" value={analytics.avgLoss.toFixed(2)} color="#fca5a5" />
        <StatTile label="Expectancy / trade" value={`${analytics.expectancy >= 0 ? '+' : ''}${analytics.expectancy.toFixed(2)}`} />
        <StatTile label="Largest win / loss" value={`+${analytics.largestWin.toFixed(2)} / ${analytics.largestLoss.toFixed(2)}`} />
      </div>

      <div>
        <p className="text-[10px] uppercase tracking-wider mb-1" style={{ color: 'rgba(255,255,255,0.35)' }}>
          Equity curve {analytics.dateRange.from ? `· ${analytics.dateRange.from} → ${analytics.dateRange.to}` : ''}
        </p>
        <EquityCurveSvg curve={analytics.equityCurve} />
      </div>

      <Scoreboard rows={analytics.byStrategyAndSymbol} />

      <div className="grid gap-4 [grid-template-columns:repeat(auto-fill,minmax(340px,1fr))]">
        <Breakdown title="By symbol" rows={analytics.bySymbol.map(r => ({ label: r.symbol, trades: r.trades, netProfit: r.netProfit, winRate: r.winRate }))} />
        <Breakdown title="By side" rows={analytics.bySide.map(r => ({ label: r.side, trades: r.trades, netProfit: r.netProfit, winRate: r.winRate }))} />
      </div>
      <Breakdown title="By strategy" rows={analytics.byStrategy.map(r => ({ label: r.label, trades: r.trades, netProfit: r.netProfit, winRate: r.winRate }))} />
      {!analytics.byStrategy.length && byStrategyHint && (
        <p className="text-[10px]" style={{ color: 'rgba(255,255,255,0.3)' }}>{byStrategyHint}</p>
      )}
    </div>
  );
}

export function ScorecardTab({ desk }: { desk: TradingDeskState }) {
  const { learning, circuitBreaker, resetBreaker, ownBookAnalytics: ownAnalytics, ownBookSource, ownBookLoading } = desk;
  const [analytics, setAnalytics] = useState<JournalAnalytics | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [fileName, setFileName] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    void loadSetting<{ fileName: string; trades: JournalTrade[] } | null>(LAST_IMPORT_KEY, null).then(saved => {
      if (saved?.trades?.length) {
        setAnalytics(computeJournalAnalytics(saved.trades));
        setFileName(saved.fileName);
      }
    });
  }, []);

  const handleFile = useCallback(async (file: File) => {
    const text = await file.text();
    const parsed = parseJournalCsv(text);
    if (!parsed.ok) {
      toast.error(parsed.error || 'Could not parse this CSV');
      return;
    }
    setAnalytics(computeJournalAnalytics(parsed.trades));
    setFileName(file.name);
    await saveSetting(LAST_IMPORT_KEY, { fileName: file.name, trades: parsed.trades });
    toast.success(`Parsed ${parsed.trades.length} trades${parsed.skippedRows ? ` (${parsed.skippedRows} rows skipped)` : ''} — instant analytics below`);
  }, []);

  const clearImport = useCallback(async () => {
    setAnalytics(null);
    setFileName(null);
    await saveSetting(LAST_IMPORT_KEY, null);
  }, []);

  return (
    <div className="space-y-4 max-w-[1100px]">
      <StrategyLedgerPanel />

      <WidgetCard title="Agent learning (live, from the decision loop)">
        {learning ? (
          <div className="grid gap-2 [grid-template-columns:repeat(auto-fill,minmax(230px,1fr))]">
            <StatTile label="Trades closed" value={String(learning.tradesClosed)} />
            <StatTile label="Win rate (all-time)" value={`${(learning.winRate * 100).toFixed(0)}%`} color={learning.winRate >= 0.5 ? '#6ee7b7' : '#fca5a5'} />
            <StatTile label="W / L" value={`${learning.wins} / ${learning.losses}`} />
            <StatTile
              label={learning.recentOutcomes.length < 15 ? `Adapting in ${15 - learning.recentOutcomes.length} trades` : 'Learned min-conf'}
              value={learning.recentOutcomes.length < 15 ? `${learning.recentOutcomes.length}/15 sampled` : `${(learning.learnedMinConfidence * 100).toFixed(0)}%`}
            />
          </div>
        ) : (
          <p className="text-[11px]" style={{ color: 'rgba(255,255,255,0.35)' }}>No stats yet</p>
        )}
        {learning?.lastLesson && (
          <p className="text-[11px] mt-2" style={{ color: 'rgba(255,255,255,0.4)' }}>{learning.lastLesson}</p>
        )}
        <p className="text-[10px] mt-2" style={{ color: 'rgba(255,255,255,0.3)' }}>
          Confidence floor and edge bias only move once 15+ trades have closed, recomputed from the trailing 30 — not nudged trade-by-trade — so a short streak can't swing selectivity on its own.
        </p>
      </WidgetCard>

      <WidgetCard title="Circuit breaker" headerAction={circuitBreaker?.tripped ? (
        <button type="button" onClick={() => void resetBreaker()} className="text-[10px]" style={{ color: '#fca5a5' }}>Reset</button>
      ) : undefined}>
        {circuitBreaker ? (
          <div className="flex items-center gap-4">
            <StatTile label="Status" value={circuitBreaker.tripped ? 'TRIPPED' : 'Armed'} color={circuitBreaker.tripped ? '#fca5a5' : '#6ee7b7'} />
            <StatTile label="Peak equity" value={`$${circuitBreaker.peakEquity.toFixed(0)}`} />
            {circuitBreaker.trippedAt && <StatTile label="Tripped at" value={new Date(circuitBreaker.trippedAt).toLocaleString()} />}
          </div>
        ) : (
          <p className="text-[11px]" style={{ color: 'rgba(255,255,255,0.35)' }}>Arms itself on the first agent cycle.</p>
        )}
        {circuitBreaker?.tripped && (
          <p className="text-[11px] mt-2" style={{ color: '#fca5a5' }}>{circuitBreaker.trippedReason}</p>
        )}
      </WidgetCard>

      <WidgetCard title={`His own book — ${ownBookSource === 'metaapi' ? 'real MT5 account history' : 'internal paper book'}`}>
        <p className="text-[10px] mb-3" style={{ color: 'rgba(255,255,255,0.35)' }}>
          {ownBookSource === 'metaapi'
            ? `Pulled live from the connected MT5 account's closed-deal history (last ${OWN_BOOK_LOOKBACK_DAYS} days) — this is the real account, not AXE's internal mock.`
            : 'No MT5 account connected — showing the internal $100k paper mirror instead. Connect MetaAPI in Settings to see the real account here.'}
        </p>
        {ownBookLoading ? (
          <p className="text-[11px]" style={{ color: 'rgba(255,255,255,0.35)' }}>Loading MT5 history…</p>
        ) : ownAnalytics ? (
          <AnalyticsPanel
            analytics={ownAnalytics}
            byStrategyHint="No comment/label grouping available on these deals — the by-strategy breakdown needs trade comments (MT5) or agent rationale text (paper)."
          />
        ) : (
          <p className="text-[11px]" style={{ color: 'rgba(255,255,255,0.35)' }}>
            No closed trades in this window yet.
          </p>
        )}
      </WidgetCard>

      <WidgetCard title="Broker CSV journal — for outside accounts" headerAction={fileName ? (
        <button type="button" onClick={() => void clearImport()} className="flex items-center gap-1 text-[10px]" style={{ color: 'rgba(255,255,255,0.4)' }}>
          <X size={11} /> Clear
        </button>
      ) : undefined}>
        <div
          onDragOver={e => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={e => {
            e.preventDefault();
            setDragOver(false);
            const file = e.dataTransfer.files?.[0];
            if (file) void handleFile(file);
          }}
          onClick={() => fileInputRef.current?.click()}
          className="rounded-lg p-6 flex flex-col items-center justify-center gap-2 cursor-pointer text-center"
          style={{
            border: `1.5px dashed ${dragOver ? 'rgba(167,139,250,0.6)' : 'rgba(255,255,255,0.15)'}`,
            background: dragOver ? 'rgba(167,139,250,0.06)' : 'rgba(255,255,255,0.02)',
          }}
        >
          <UploadCloud size={22} style={{ color: dragOver ? '#c4b5fd' : 'rgba(255,255,255,0.35)' }} />
          <p className="text-[12px]" style={{ color: '#F5F0E6' }}>
            {fileName ? `Loaded: ${fileName}` : 'Drop a broker’s trade history CSV here, or click to browse'}
          </p>
          <p className="text-[10px]" style={{ color: 'rgba(255,255,255,0.35)' }}>
            MT4/MT5 account history export, or any CSV with Symbol/Side/Volume/Profit columns — for accounts outside AXE.
          </p>
          <input
            ref={fileInputRef}
            type="file"
            accept=".csv,text/csv"
            className="hidden"
            onChange={e => { const f = e.target.files?.[0]; if (f) void handleFile(f); e.target.value = ''; }}
          />
        </div>

        {analytics && (
          <div className="mt-4">
            <AnalyticsPanel
              analytics={analytics}
              byStrategyHint="No strategy/comment column found in this export — add one in MT5 (right-click a trade → comment) to get a by-strategy breakdown next time."
            />
          </div>
        )}
      </WidgetCard>
    </div>
  );
}
