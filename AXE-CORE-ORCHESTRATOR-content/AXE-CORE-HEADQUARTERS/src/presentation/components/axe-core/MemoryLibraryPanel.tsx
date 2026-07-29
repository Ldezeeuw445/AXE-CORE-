/**
 * MemoryLibraryPanel — visual "biggest cleanest library" surface for AXE memory.
 * Shows live growth, Memory Manager status, and shelves by store type.
 */
import { useCallback, useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import {
  BookOpen,
  Brain,
  Database,
  Library,
  Network,
  RefreshCw,
  Sparkles,
  Zap,
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
import { NeuralMemorySystem } from '@/presentation/components/axe-core/NeuralMemorySystem';
import { listRecentObsidianNotes } from '@/infrastructure/persistence/obsidianMemoryService';
import type { ObsidianNote } from '@/infrastructure/persistence/obsidianMemoryService';

function Shelf({
  title,
  count,
  color,
  icon,
  subtitle,
}: {
  title: string;
  count: number;
  color: string;
  icon: React.ReactNode;
  subtitle: string;
}) {
  const filled = Math.min(24, Math.max(1, Math.ceil(count / 3) || 1));
  return (
    <div
      className="rounded-xl p-4 flex flex-col gap-3"
      style={{
        background: 'var(--bg-surface)',
        border: `1px solid ${color}33`,
        boxShadow: count > 0 ? `0 0 24px ${color}12` : 'none',
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
        <div
          className="font-mono text-[18px] font-bold tabular-nums"
          style={{ color }}
        >
          {count.toLocaleString()}
        </div>
      </div>
      {/* Book spines */}
      <div className="flex items-end gap-[3px] h-10 overflow-hidden">
        {Array.from({ length: filled }).map((_, i) => (
          <motion.div
            key={i}
            initial={{ height: 0, opacity: 0 }}
            animate={{
              height: 16 + ((i * 7) % 22),
              opacity: 0.55 + (i % 5) * 0.08,
            }}
            transition={{ delay: i * 0.02, duration: 0.35 }}
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
    </div>
  );
}

export default function MemoryLibraryPanel() {
  const [stats, setStats] = useState<MemoryGrowthStats | null>(null);
  const [report, setReport] = useState<MemoryManagerReport | null>(null);
  const [recentNotes, setRecentNotes] = useState<ObsidianNote[]>([]);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);

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

  const handleRunManager = async () => {
    setBusy(true);
    try {
      const r = await runMemoryManager({ force: true });
      setReport(r);
      await reload();
    } finally {
      setBusy(false);
    }
  };

  const total = stats?.total ?? 0;

  return (
    <div className="h-full overflow-y-auto">
      <div className="p-4 sm:p-6 space-y-5 max-w-6xl mx-auto">
        {/* Hero */}
        <div
          className="rounded-2xl p-5 relative overflow-hidden"
          style={{
            background: 'linear-gradient(135deg, rgba(16,185,129,0.08), rgba(34,211,238,0.06), rgba(139,92,246,0.06))',
            border: '1px solid rgba(16,185,129,0.25)',
          }}
        >
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-start gap-3">
              <div
                className="rounded-xl flex items-center justify-center flex-shrink-0"
                style={{
                  width: 48,
                  height: 48,
                  background: 'rgba(16,185,129,0.15)',
                  border: '1px solid rgba(16,185,129,0.35)',
                  boxShadow: total > 0 ? '0 0 20px rgba(16,185,129,0.25)' : 'none',
                }}
              >
                <Library size={22} color="#34d399" />
              </div>
              <div>
                <div className="text-[11px] font-mono uppercase tracking-wider" style={{ color: '#6ee7b7' }}>
                  AXE Durable Brain
                </div>
                <div className="text-[22px] font-bold tabular-nums" style={{ color: 'var(--text-primary)' }}>
                  {loading ? '…' : total.toLocaleString()}{' '}
                  <span className="text-[13px] font-normal" style={{ color: 'var(--text-muted)' }}>
                    nodes in the library
                  </span>
                </div>
                <p className="text-[12px] mt-1 max-w-lg" style={{ color: 'var(--text-muted)' }}>
                  Global memory · RAG facts · Obsidian notes with graph links.
                  Every chat pulls from this library. The Memory Manager consolidates daily.
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
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
                  background: 'rgba(167,139,250,0.18)',
                  color: '#c4b5fd',
                  border: '1px solid rgba(167,139,250,0.35)',
                }}
              >
                <Sparkles size={12} /> {busy ? 'Consolidating…' : 'Run Memory Manager'}
              </button>
            </div>
          </div>

          {report && (
            <div
              className="mt-4 text-[11px] font-mono px-3 py-2 rounded-lg"
              style={{ background: 'rgba(0,0,0,0.35)', color: 'rgba(255,255,255,0.55)' }}
            >
              <Zap size={11} className="inline mr-1.5" style={{ color: '#a78bfa' }} />
              Last manager: {report.message}
              {report.ranAt && (
                <span className="opacity-60">
                  {' '}· {new Date(report.ranAt).toLocaleString('nl-NL')}
                </span>
              )}
              {typeof report.factsExtracted === 'number' && (
                <span style={{ color: '#6ee7b7' }}> · +{report.factsExtracted} facts</span>
              )}
            </div>
          )}
        </div>

        {/* Shelves */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <Shelf
            title="Obsidian notes"
            count={stats?.noteCount ?? 0}
            color="#22d3ee"
            icon={<BookOpen size={16} />}
            subtitle="Co-founder library · [[links]]"
          />
          <Shelf
            title="RAG facts"
            count={stats?.ragCount ?? 0}
            color="#a78bfa"
            icon={<Brain size={16} />}
            subtitle="Durable extracted knowledge"
          />
          <Shelf
            title="Global memory"
            count={stats?.globalCount ?? 0}
            color="#34d399"
            icon={<Database size={16} />}
            subtitle="Preferences · performance · events"
          />
        </div>

        {/* Neural + recent notes */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div
            className="rounded-xl overflow-hidden relative"
            style={{
              height: 320,
              border: '1px solid rgba(139,92,246,0.25)',
              background: '#000',
            }}
          >
            <div
              className="absolute top-3 left-3 z-10 flex items-center gap-1.5 text-[10px] font-mono px-2 py-1 rounded"
              style={{ background: 'rgba(0,0,0,0.65)', color: '#c4b5fd' }}
            >
              <Network size={11} /> Neural map
            </div>
            <NeuralMemorySystem />
          </div>

          <div
            className="rounded-xl p-4 flex flex-col"
            style={{
              background: 'var(--bg-surface)',
              border: '1px solid var(--border-subtle)',
              minHeight: 320,
            }}
          >
            <div className="flex items-center gap-2 mb-3">
              <BookOpen size={14} color="var(--accent-cyan)" />
              <span className="text-[12px] font-semibold" style={{ color: 'var(--text-primary)' }}>
                Recent notes
              </span>
            </div>
            <div className="flex-1 space-y-2 overflow-y-auto">
              {recentNotes.length === 0 && (
                <p className="text-[11px] italic" style={{ color: 'var(--text-muted)' }}>
                  Nog geen notes. Chat met AXE of run de Memory Manager — reflecties landen hier.
                </p>
              )}
              {recentNotes.map((n) => (
                <div
                  key={n.path}
                  className="rounded-lg px-3 py-2"
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
                </div>
              ))}
            </div>
          </div>
        </div>

        <p className="text-[10px] text-center font-mono" style={{ color: 'rgba(255,255,255,0.25)' }}>
          Chat injects this library automatically via buildDurableMemoryContext · branch orchestrator
        </p>
      </div>
    </div>
  );
}
