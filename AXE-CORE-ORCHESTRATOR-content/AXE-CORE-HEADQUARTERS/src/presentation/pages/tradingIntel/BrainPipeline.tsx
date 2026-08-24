/**
 * The desk as a pipeline, left to right.
 *
 * Four agents in the order the work actually flows: Research finds it, Intel
 * adds what the feeds know, Companion weighs it with its indicators, Algo
 * places the trade. Reading across a row shows the handoff — what the next
 * one did with what the previous one found — which is the whole reason this
 * replaced four unrelated panels.
 *
 * Each lane is the same three things, so the eye can compare them:
 *   1. what it last concluded
 *   2. the button that runs it
 *   3. what it remembers, in its own namespace
 *
 * Empty lanes say they are empty. A lane that quietly showed another agent's
 * rows would make the pipeline look connected while proving nothing, and the
 * point of the layout is to be able to check the handoff by eye.
 */
import { useEffect, useState } from 'react';
import { Loader2, Play } from 'lucide-react';
import {
  recall, type MemoryRow, type MemoryNamespace,
} from '@/infrastructure/persistence/agentMemoryService';

export interface LaneSpec {
  id: MemoryNamespace;
  title: string;
  /** Accent colour — the same one the agent carries everywhere else. */
  color: string;
  /** One line: what this agent concluded last. */
  headline?: string | null;
  /** The reasoning behind it, already formatted. */
  detail?: string | null;
  /** Freshness, so a stale lane cannot pass for a live one. */
  at?: string | null;
  /** What it hands the next lane. Rendered as the arrow's label. */
  handoff?: string | null;
  running?: boolean;
  onRun?: () => void;
  runLabel: string;
}

function timeAgo(iso?: string | null): string | null {
  if (!iso) return null;
  const ms = Date.now() - new Date(iso).getTime();
  if (!Number.isFinite(ms) || ms < 0) return null;
  const m = Math.floor(ms / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

function Lane({ spec, memory, loading }: { spec: LaneSpec; memory: MemoryRow[]; loading: boolean }) {
  const ago = timeAgo(spec.at);
  return (
    <div className="flex-1 min-w-0 flex flex-col gap-2">
      <div
        className="rounded-xl p-3 min-h-[104px] flex flex-col"
        style={{ background: `${spec.color}0d`, border: `1px solid ${spec.color}44` }}
      >
        <div className="flex items-baseline gap-2">
          <span className="text-[9px] font-mono-data tracking-[0.16em] uppercase" style={{ color: spec.color }}>
            {spec.title}
          </span>
          {ago && (
            <span className="text-[9px] font-mono-data ml-auto" style={{ color: 'rgba(255,255,255,0.3)' }}>{ago}</span>
          )}
        </div>
        {spec.headline ? (
          <>
            <div className="mt-1 text-[14px] font-medium tracking-[-0.01em] truncate" style={{ color: '#fff' }}>
              {spec.headline}
            </div>
            {spec.detail && (
              <p className="mt-1 text-[11px] leading-relaxed line-clamp-4" style={{ color: 'rgba(255,255,255,0.5)' }}>
                {spec.detail}
              </p>
            )}
          </>
        ) : (
          // Said plainly. A lane with nothing in it is information — it means
          // the handoff stops here — and dressing it up hides exactly that.
          <p className="mt-2 text-[11px]" style={{ color: 'rgba(255,255,255,0.3)' }}>
            Nothing yet — run it to see what it concludes.
          </p>
        )}
      </div>

      <button
        type="button"
        disabled={!spec.onRun || spec.running}
        onClick={spec.onRun}
        className="flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-[12px] disabled:opacity-40"
        style={{ background: `${spec.color}22`, color: spec.color, border: `1px solid ${spec.color}44` }}
      >
        {spec.running ? <Loader2 size={14} className="animate-spin" /> : <Play size={14} />}
        {spec.runLabel}
      </button>

      <div
        className="rounded-xl p-2 flex-1 min-h-0 overflow-y-auto"
        style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)' }}
      >
        <div className="text-[9px] font-mono-data tracking-[0.16em] uppercase mb-1.5 sticky top-0"
             style={{ color: spec.color, background: '#0b0c0d' }}>
          {spec.title} memory
        </div>
        {loading ? (
          <p className="text-[11px]" style={{ color: 'rgba(255,255,255,0.3)' }}>Loading…</p>
        ) : memory.length === 0 ? (
          <p className="text-[11px] leading-relaxed" style={{ color: 'rgba(255,255,255,0.3)' }}>
            No memory in this namespace yet. It fills as the agent runs.
          </p>
        ) : (
          <div className="space-y-1">
            {memory.slice(0, 30).map(m => (
              <div key={m.id} className="rounded p-1.5" style={{ background: 'rgba(255,255,255,0.035)' }}>
                <div className="flex items-center gap-1.5">
                  <span className="text-[8px] px-1 py-0.5 rounded-full uppercase tracking-wide"
                        style={{ background: `${spec.color}22`, color: spec.color }}>
                    {m.kind}
                  </span>
                  {m.symbol && (
                    <span className="text-[9px] font-mono-data" style={{ color: 'rgba(255,255,255,0.5)' }}>{m.symbol}</span>
                  )}
                  <span className="text-[9px] font-mono-data ml-auto" style={{ color: 'rgba(255,255,255,0.28)' }}>
                    {timeAgo(m.created_at)}
                  </span>
                </div>
                <p className="mt-0.5 text-[11px] leading-relaxed line-clamp-3" style={{ color: 'rgba(255,255,255,0.45)' }}>
                  {m.content}
                </p>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

/** The arrow between two lanes, labelled with what actually crossed it. */
function Handoff({ label, color }: { label?: string | null; color: string }) {
  return (
    <div className="hidden xl:flex flex-col items-center justify-start pt-9 w-[92px] shrink-0">
      <div className="text-[18px] leading-none" style={{ color: `${color}88` }}>→</div>
      <div className="mt-1 text-[9px] text-center leading-tight px-1"
           style={{ color: label ? 'rgba(255,255,255,0.42)' : 'rgba(255,255,255,0.2)' }}>
        {label ?? 'nothing passed'}
      </div>
    </div>
  );
}

export function BrainPipeline({ lanes }: { lanes: LaneSpec[] }) {
  const [memory, setMemory] = useState<Record<string, MemoryRow[]>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      // Per lane, not one query filtered afterwards: each agent reads its own
      // namespace, and reproducing that here is what makes the column an
      // honest picture of what that agent can actually see.
      const pairs = await Promise.all(
        lanes.map(async l => [l.id, await recall(l.id, { limit: 40 })] as const),
      );
      if (cancelled) return;
      setMemory(Object.fromEntries(pairs));
      setLoading(false);
    };
    void load();
    const t = setInterval(() => void load(), 60_000);
    return () => { cancelled = true; clearInterval(t); };
  }, [lanes]);

  return (
    <div className="flex flex-col xl:flex-row gap-3 h-full min-h-0">
      {lanes.map((lane, i) => (
        <>
          <Lane key={lane.id} spec={lane} memory={memory[lane.id] ?? []} loading={loading} />
          {i < lanes.length - 1 && (
            <Handoff key={`${lane.id}-arrow`} label={lane.handoff} color={lane.color} />
          )}
        </>
      ))}
    </div>
  );
}
