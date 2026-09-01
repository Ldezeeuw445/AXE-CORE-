/**
 * MemoryLibraryPanel — visual "biggest cleanest library" surface for AXE memory.
 * Shows live growth, Memory Manager status, shelves by store type, sparkline,
 * neural preview + recent notes. Shelves are clickable.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router';
import { motion, AnimatePresence } from 'framer-motion';
import {
  BookOpen,
  Brain,
  Database,
  Library,
  Network,
  RefreshCw,
  Sparkles,
  Zap,
  TrendingUp,
} from 'lucide-react';
import {
  loadMemoryGrowthStats,
  type MemoryGrowthStats,
} from '@/infrastructure/persistence/memoryStatsService';
import {
  runMemoryManager,
  getLastMemoryManagerReport,
  type MemoryManagerReport,
} from '@/infrastructure/persistence/memoryManagerService';
import NeuralBrain from '@/presentation/components/axe-core/NeuralBrain';
import { NeuralMemorySystem } from '@/presentation/components/axe-core/NeuralMemorySystem';
import { ObsidianNeuralGraph } from '@/presentation/components/axe-core/ObsidianNeuralGraph';
import { listRecentObsidianNotes } from '@/infrastructure/persistence/obsidianMemoryService';
import type { ObsidianNote } from '@/infrastructure/persistence/obsidianMemoryService';
import { LIST_GRID } from '@/presentation/components/surface/Page';
import { cn } from '@/shared/utils';

function GrowthSparkline({ history }: { history: number[] }) {
  const pts = history.length >= 2 ? history : history.length === 1 ? [history[0], history[0]] : [0, 0];
  const max = Math.max(...pts, 1);
  const min = Math.min(...pts, 0);
  const range = Math.max(1, max - min);
  const w = 120;
  const h = 28;
  const d = pts
    .map((v, i) => {
      const x = (i / (pts.length - 1 || 1)) * w;
      const y = h - ((v - min) / range) * (h - 4) - 2;
      return `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(' ');

  return (
    <svg width={w} height={h} className="overflow-visible" aria-hidden>
      <defs>
        <linearGradient id="axeGrowthFill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#34d399" stopOpacity="0.35" />
          <stop offset="100%" stopColor="#34d399" stopOpacity="0" />
        </linearGradient>
      </defs>
      <path
        d={`${d} L${w},${h} L0,${h} Z`}
        fill="url(#axeGrowthFill)"
      />
      <path
        d={d}
        fill="none"
        stroke="#34d399"
        strokeWidth={1.6}
        strokeLinecap="round"
        strokeLinejoin="round"
        style={{ filter: 'drop-shadow(0 0 4px rgba(52,211,153,0.5))' }}
      />
    </svg>
  );
}

function Shelf({
  title,
  count,
  color,
  icon,
  subtitle,
  onClick,
}: {
  title: string;
  count: number;
  color: string;
  icon: React.ReactNode;
  subtitle: string;
  onClick?: () => void;
}) {
  const filled = Math.min(28, Math.max(1, Math.ceil(count / 2.5) || 1));
  return (
    <button
      type="button"
      onClick={onClick}
      className="rounded-xl p-4 flex flex-col gap-3 text-left w-full transition-transform hover:scale-[1.015] active:scale-[0.99]"
      style={{
        background: 'var(--bg-surface)',
        border: `1px solid ${color}33`,
        boxShadow: count > 0 ? `0 0 24px ${color}12` : 'none',
        cursor: onClick ? 'pointer' : 'default',
      }}
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span style={{ color }}>{icon}</span>
          <div>
            <div className="text-[12px] font-semibold" style={{ color: 'var(--text-primary)' }}>
              {title}
            </div>
            <div className="text-[10px]" style={{ color: 'var(--text-muted)' }}>
              {subtitle}
            </div>
          </div>
        </div>
        <motion.div
          key={count}
          initial={{ scale: 1.15, opacity: 0.6 }}
          animate={{ scale: 1, opacity: 1 }}
          className="font-mono text-[18px] font-bold tabular-nums"
          style={{ color }}
        >
          {count.toLocaleString()}
        </motion.div>
      </div>
      <div className="flex items-end gap-[3px] h-10 overflow-hidden">
        {Array.from({ length: filled }).map((_, i) => (
          <motion.div
            key={i}
            initial={{ height: 0, opacity: 0 }}
            animate={{
              height: 16 + ((i * 7) % 22),
              opacity: 0.55 + (i % 5) * 0.08,
            }}
            transition={{ delay: i * 0.015, duration: 0.35 }}
            className="rounded-sm flex-shrink-0"
            style={{
              width: 6 + (i % 3),
              background: color,
              boxShadow: `0 0 6px ${color}44`,
            }}
          />
        ))}
        {count === 0 && (
          <span className="text-[10px] italic" style={{ color: 'var(--text-muted)' }}>
            empty shelf
          </span>
        )}
      </div>
    </button>
  );
}

/** Which renderer fills the map slot. Everything around it stays put. */
export type LibraryVisual = 'neural' | 'terrain' | 'obsidian';

const VISUAL_CAPTION: Record<LibraryVisual, string> = {
  neural: 'Neural map · same engine as Home',
  terrain: 'Memory terrain · volumetric density',
  obsidian: 'Obsidian graph · notes + links',
};

export default function MemoryLibraryPanel({ visual = 'neural' }: { visual?: LibraryVisual } = {}) {
  const navigate = useNavigate();
  const [stats, setStats] = useState<MemoryGrowthStats | null>(null);
  const [report, setReport] = useState<MemoryManagerReport | null>(null);
  const [recentNotes, setRecentNotes] = useState<ObsidianNote[]>([]);
  const [graphNotes, setGraphNotes] = useState<ObsidianNote[]>([]);
  const [selectedNote, setSelectedNote] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [flash, setFlash] = useState(false);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const [s, notes] = await Promise.all([
        loadMemoryGrowthStats(),
        listRecentObsidianNotes(8).catch(() => [] as ObsidianNote[]),
      ]);
      setStats(s);
      setRecentNotes(notes);
      setReport(getLastMemoryManagerReport());
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void reload();
    const t = window.setInterval(() => void reload(), 30_000);
    return () => window.clearInterval(t);
  }, [reload]);

  useEffect(() => {
    if (visual !== 'obsidian') return;
    let cancelled = false;
    void listRecentObsidianNotes(300)
      .then(n => { if (!cancelled) setGraphNotes(n); })
      .catch(() => { /* graph simply stays empty */ });
    return () => { cancelled = true; };
  }, [visual]);

  const handleRunManager = async () => {
    setBusy(true);
    setFlash(true);
    try {
      const r = await runMemoryManager({ force: true });
      setReport(r);
      await reload();
    } finally {
      setBusy(false);
      window.setTimeout(() => setFlash(false), 1800);
    }
  };

  const total = stats?.total ?? 0;
  const history = stats?.history ?? [];
  const delta = stats?.delta ?? 0;

  const growthLabel = useMemo(() => {
    if (delta > 0) return `+${delta} since last check`;
    if (total > 0) return 'library stable';
    return 'waiting for first memories';
  }, [delta, total]);

  return (
    <div className="h-full min-h-0 flex flex-col overflow-hidden">
      <div className="flex-1 min-h-0 overflow-y-auto flex flex-col">
        <div className="p-4 sm:p-6 lg:p-8 space-y-5 w-full flex flex-col flex-1 min-h-0">
          <div
            className="rounded-2xl p-5 lg:p-6 relative overflow-hidden flex-shrink-0"
            style={{
              background: flash
                ? 'linear-gradient(135deg, rgba(167,139,250,0.18), rgba(16,185,129,0.12), rgba(34,211,238,0.1))'
                : 'linear-gradient(135deg, rgba(16,185,129,0.08), rgba(34,211,238,0.06), rgba(139,92,246,0.06))',
              border: flash
                ? '1px solid rgba(167,139,250,0.45)'
                : '1px solid rgba(16,185,129,0.25)',
              boxShadow: flash ? '0 0 40px rgba(167,139,250,0.2)' : 'none',
              transition: 'background 0.4s, border 0.4s, box-shadow 0.4s',
            }}
          >
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div className="flex items-start gap-3">
                <motion.div
                  className="rounded-xl flex items-center justify-center flex-shrink-0"
                  animate={flash ? { scale: [1, 1.12, 1], rotate: [0, -6, 6, 0] } : {}}
                  transition={{ duration: 0.7 }}
                  style={{
                    width: 48,
                    height: 48,
                    background: 'rgba(16,185,129,0.15)',
                    border: '1px solid rgba(16,185,129,0.35)',
                    boxShadow: total > 0 ? '0 0 20px rgba(16,185,129,0.25)' : 'none',
                  }}
                >
                  <Library size={22} color="#34d399" />
                </motion.div>
                <div>
                  <div className="text-[11px] font-mono uppercase tracking-wider" style={{ color: '#6ee7b7' }}>
                    AXE Durable Brain
                  </div>
                  <div className="flex items-baseline gap-2 flex-wrap">
                    <motion.div
                      key={total}
                      initial={{ y: -6, opacity: 0 }}
                      animate={{ y: 0, opacity: 1 }}
                      className="text-[22px] lg:text-[28px] font-bold tabular-nums"
                      style={{ color: 'var(--text-primary)' }}
                    >
                      {loading ? '…' : total.toLocaleString()}
                    </motion.div>
                    <span className="text-[13px] font-normal" style={{ color: 'var(--text-muted)' }}>
                      nodes in the library
                    </span>
                    {delta > 0 && (
                      <span
                        className="text-[11px] font-mono px-1.5 py-0.5 rounded"
                        style={{ background: 'rgba(52,211,153,0.15)', color: '#6ee7b7' }}
                      >
                        +{delta}
                      </span>
                    )}
                  </div>
                  <p className="text-[12px] mt-1 max-w-2xl" style={{ color: 'var(--text-muted)' }}>
                    Global memory · RAG facts · Obsidian notes with graph links.
                    Every chat pulls from this library. The Memory Manager consolidates daily.
                  </p>
                </div>
              </div>
              <div className="flex flex-col items-end gap-2 flex-shrink-0">
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => void reload()}
                    disabled={loading}
                    className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-[11px]"
                    style={{ background: 'rgba(255,255,255,0.05)', color: 'var(--text-muted)' }}
                  >
                    <RefreshCw size={12} className={loading ? 'animate-spin' : ''} /> Refresh
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleRunManager()}
                    disabled={busy}
                    className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-[11px] font-medium"
                    style={{
                      background: busy ? 'rgba(167,139,250,0.28)' : 'rgba(167,139,250,0.18)',
                      color: '#c4b5fd',
                      border: '1px solid rgba(167,139,250,0.35)',
                    }}
                  >
                    <Sparkles size={12} className={busy ? 'animate-pulse' : ''} />{' '}
                    {busy ? 'Consolidating…' : 'Run Memory Manager'}
                  </button>
                </div>
                {history.length > 0 && (
                  <div className="flex items-center gap-2">
                    <TrendingUp size={12} style={{ color: 'var(--success)' }} />
                    <GrowthSparkline history={history} />
                    <span className="text-[9px] font-mono" style={{ color: 'var(--text-muted)' }}>
                      {growthLabel}
                    </span>
                  </div>
                )}
              </div>
            </div>

            <AnimatePresence>
              {report && (
                <motion.div
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="mt-4 text-[11px] font-mono px-3 py-2 rounded-lg"
                  style={{
                    background: 'rgba(0,0,0,0.35)',
                    color: 'rgba(255,255,255,0.55)',
                    borderLeft: report.health === 'error'
                      ? '2px solid #f87171'
                      : report.health === 'warning'
                      ? '2px solid #fbbf24'
                      : '2px solid transparent',
                  }}
                >
                  <Zap
                    size={11}
                    className="inline mr-1.5"
                    style={{ color: report.health === 'error' ? 'var(--error)' : report.health === 'warning' ? 'var(--warning)' : '#a78bfa' }}
                  />
                  Last manager: {report.message}
                  {report.ranAt && (
                    <span className="opacity-60">
                      {' '}· {new Date(report.ranAt).toLocaleString('nl-NL')}
                    </span>
                  )}
                  {typeof report.factsExtracted === 'number' && report.factsExtracted > 0 && (
                    <span style={{ color: '#6ee7b7' }}> · +{report.factsExtracted} facts</span>
                  )}
                  {report.issues && report.issues.length > 0 && (
                    <ul className="mt-1.5 pl-4 list-disc" style={{ color: '#fca5a5' }}>
                      {report.issues.map((issue, i) => <li key={i}>{issue}</li>)}
                    </ul>
                  )}
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          <div className={cn(LIST_GRID, 'lg:gap-4 flex-shrink-0')}>
            <Shelf
              title="Obsidian notes"
              count={stats?.noteCount ?? 0}
              color="#22d3ee"
              icon={<BookOpen size={16} />}
              subtitle="Co-founder library · [[links]] · click → Obsidian"
              onClick={() => navigate('/obsidian')}
            />
            <Shelf
              title="RAG facts"
              count={stats?.ragCount ?? 0}
              color="#a78bfa"
              icon={<Brain size={16} />}
              subtitle="Durable extracted knowledge · click → Explorer"
              onClick={() => navigate('/memory/explore')}
            />
            <Shelf
              title="Global memory"
              count={stats?.globalCount ?? 0}
              color="#34d399"
              icon={<Database size={16} />}
              subtitle="Preferences · performance · events · click → Explorer"
              onClick={() => navigate('/memory/explore')}
            />
          </div>

          <div className="grid gap-4 [grid-template-columns:repeat(auto-fill,minmax(340px,1fr))] lg:gap-5 flex-1 min-h-[320px]">
            <div
              className="rounded-xl overflow-hidden relative h-full min-h-[320px]"
              style={{
                border: '1px solid rgba(139,92,246,0.25)',
                background: '#000',
              }}
            >
              <div
                // Both this and the button below are pinned to the same top
                // edge from opposite sides. In a 340px cell they met in the
                // middle and overlapped, so the caption yields: it is a label,
                // the button is a control.
                className="absolute top-3 left-3 z-10 flex max-w-[calc(100%-150px)] items-center gap-1.5 truncate rounded px-2 py-1 font-mono text-[10px]"
                style={{ background: 'rgba(0,0,0,0.65)', color: '#c4b5fd' }}
                title={VISUAL_CAPTION[visual]}
              >
                <Network size={11} className="flex-none" />
                <span className="truncate">{VISUAL_CAPTION[visual]}</span>
              </div>
              <button
                type="button"
                onClick={() => navigate('/obsidian')}
                className="absolute top-3 right-3 z-10 whitespace-nowrap rounded px-2 py-1 font-mono text-[9px]"
                style={{
                  background: 'var(--tint)',
                  color: '#67e8f9',
                  border: '1px solid var(--tint-line)',
                }}
              >
                Open full graph →
              </button>
              {visual === 'neural' ? (
                <NeuralBrain />
              ) : visual === 'terrain' ? (
                <NeuralMemorySystem />
              ) : (
                <ObsidianNeuralGraph
                  notes={graphNotes}
                  selectedPath={selectedNote}
                  onSelectPath={setSelectedNote}
                />
              )}
            </div>

            <div
              className="rounded-xl p-4 flex flex-col h-full min-h-[320px]"
              style={{
                background: 'var(--bg-surface)',
                border: '1px solid var(--border-subtle)',
              }}
            >
              <div className="flex items-center justify-between mb-3 flex-shrink-0">
                <div className="flex items-center gap-2">
                  <BookOpen size={14} color="var(--accent-cyan)" />
                  <span className="text-[12px] font-semibold" style={{ color: 'var(--text-primary)' }}>
                    Recent notes
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => navigate('/obsidian')}
                  className="text-[10px] font-mono"
                  style={{ color: 'var(--accent-cyan)' }}
                >
                  all notes →
                </button>
              </div>
              <div className="flex-1 min-h-0 space-y-2 overflow-y-auto">
                {recentNotes.length === 0 && (
                  <p className="text-[11px] italic" style={{ color: 'var(--text-muted)' }}>
                    Nog geen notes. Chat met AXE of run de Memory Manager — reflecties landen hier.
                  </p>
                )}
                {recentNotes.map((n) => (
                  <button
                    key={n.path}
                    type="button"
                    onClick={() => navigate('/obsidian')}
                    className="rounded-lg px-3 py-2 w-full text-left transition-colors hover:brightness-110"
                    style={{ background: 'var(--bg-base)', border: '1px solid var(--border-subtle)' }}
                  >
                    <div className="text-[12px] font-medium truncate" style={{ color: 'var(--text-primary)' }}>
                      {n.title}
                    </div>
                    <div className="text-[10px] font-mono truncate" style={{ color: 'var(--text-muted)' }}>
                      {n.path}
                    </div>
                    {(n.wikilinks || []).length > 0 && (
                      <div className="text-[9px] mt-1" style={{ color: '#c4b5fd' }}>
                        → {(n.wikilinks || []).slice(0, 4).map((w) => `[[${w}]]`).join(' ')}
                      </div>
                    )}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <p className="text-[10px] text-center font-mono flex-shrink-0" style={{ color: 'rgba(255,255,255,0.25)' }}>
            Chat injects this library automatically via buildDurableMemoryContext · branch orchestrator
          </p>
        </div>
      </div>
    </div>
  );
}
