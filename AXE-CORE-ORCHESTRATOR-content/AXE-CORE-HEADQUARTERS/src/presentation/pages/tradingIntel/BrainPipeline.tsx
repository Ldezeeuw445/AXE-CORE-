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
  /**
   * Which lane must run before this one is meaningful.
   *
   * Not a lock — the button stays usable, because a lane you cannot press is
   * a lane you cannot test. It changes what the lane SAYS: "waiting for
   * research" instead of "nothing yet", so an empty lane distinguishes "not
   * started" from "the one before it never ran".
   */
  needs?: string | null;
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

  // Phone only — on desktop the panel is always shown and this is ignored.
  //
  // Derived rather than synced with an effect: a running lane opens itself
  // because the reason to look at this on a phone is seeing which one is
  // working, and once you tap, your choice wins until you tap again. An
  // effect that pushed `running` into state would fight the tap and re-render
  // every lane each time any of them started.
  const [override, setOverride] = useState<boolean | null>(null);
  const open = override ?? !!spec.running;
  return (
    <div className="flex-1 min-w-0 flex flex-col gap-2">
      <div
        className="rounded-xl p-3 min-h-[104px] flex flex-col"
        style={{
          background: `${spec.color}0d`,
          // A running lane is outlined, not just spinning: at a glance across
          // four columns the border is what you see first.
          border: `1px solid ${spec.running ? spec.color : `${spec.color}44`}`,
          boxShadow: spec.running ? `0 0 0 1px ${spec.color}55` : undefined,
        }}
      >
        <div className="flex items-baseline gap-2">
          {/* Beside the name, so "which one is thinking" needs no reading. */}
          {spec.running && <Loader2 size={11} className="animate-spin self-center" style={{ color: spec.color }} />}
          <span className="text-[9px] font-mono-data tracking-[0.16em] uppercase" style={{ color: spec.color }}>
            {spec.title}
          </span>
          {ago && (
            <span className="text-[9px] font-mono-data ml-auto" style={{ color: 'rgba(255,255,255,0.3)' }}>{ago}</span>
          )}
        </div>
        {spec.headline ? (
          <>
            <div className="mt-1 text-[14px] font-medium tracking-[-0.01em] truncate" style={{ color: 'var(--text-primary)' }}>
              {spec.headline}
            </div>
            {spec.detail && (
              <p className="mt-1 text-[11px] leading-relaxed line-clamp-4" style={{ color: 'rgba(255,255,255,0.5)' }}>
                {spec.detail}
              </p>
            )}
          </>
        ) : spec.running ? (
          <p className="mt-2 text-[11px]" style={{ color: spec.color }}>
            Thinking…
          </p>
        ) : (
          // Said plainly, and distinguishing the two empties: "not started"
          // and "the one before it never ran" look identical otherwise, and
          // only one of them is your turn to act on.
          <p className="mt-2 text-[11px]" style={{ color: 'rgba(255,255,255,0.3)' }}>
            {spec.needs
              ? `Waiting on ${spec.needs} — run that first so this has something to build on.`
              : 'Nothing yet — run it to see what it concludes.'}
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

      {/* On a phone the four lanes stack, and four memory logs at 38vh each is
          a page you scroll for a minute to reach the trader — the one lane that
          says whether a trade happened. So on small screens the log is folded
          behind its own header and the four lanes fit on one screen; the lane
          that is running opens itself, because the whole point of looking at
          this on a phone is seeing which one is working. On desktop there is
          width for all four and nothing folds. */}
      <button
        type="button"
        onClick={() => setOverride(!open)}
        className="xl:hidden flex items-center justify-between px-2 py-1.5 rounded-lg text-[9px] font-mono-data tracking-[0.16em] uppercase"
        style={{ color: spec.color, background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)' }}
      >
        <span>{spec.title} memory</span>
        <span style={{ color: 'rgba(255,255,255,0.35)' }}>{open ? 'hide' : `${memory.length} entries`}</span>
      </button>

      <div
        // max-h on small screens: in the stacked layout `flex-1` has no
        // ceiling, so four lanes each grew to their full memory list and the
        // page became minutes of scrolling to reach the trader.
        className={`rounded-xl p-2 flex-1 min-h-0 overflow-y-auto max-h-[38vh] xl:max-h-none ${open ? '' : 'hidden xl:block'}`}
        style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)' }}
      >
        {/* Spans the container's full width and paints an opaque strip.
            It used to be a plain sticky div inside p-2 padding: it did not
            reach the edges and its colour did not match, so scrolling rows
            passed visibly beside and behind the label. A sticky header that
            content shows through is worse than no header — it reads as two
            lines of text on top of each other. */}
        <div
          className="hidden xl:block text-[9px] font-mono-data tracking-[0.16em] uppercase sticky top-0 z-10 -mx-2 -mt-2 px-2 pt-2 pb-1.5 mb-1.5"
          style={{ color: spec.color, background: '#0F1011' }}
        >
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

/**
 * The arrow between two lanes, labelled with what actually crossed it.
 *
 * Rendered on every screen, sideways on a wide one and downward on a phone.
 * It used to be `hidden xl:flex`, which removed the handoff from the small
 * screen entirely — and the handoff is the only thing that makes this a
 * pipeline rather than four panels. Hiding it on mobile hid the point.
 */
function Handoff({ label, color }: { label?: string | null; color: string }) {
  const text = label ?? 'nothing passed';
  const dim = label ? 'rgba(255,255,255,0.42)' : 'rgba(255,255,255,0.2)';
  return (
    <>
      {/* Wide: a column between the lanes. */}
      <div className="hidden xl:flex flex-col items-center justify-start pt-9 w-[92px] shrink-0">
        <div className="text-[18px] leading-none" style={{ color: `${color}88` }}>→</div>
        <div className="mt-1 text-[9px] text-center leading-tight px-1" style={{ color: dim }}>
          {text}
        </div>
      </div>
      {/* Phone: a row between the stacked lanes, carrying the same words. */}
      <div className="flex xl:hidden items-center gap-2 pl-1 py-0.5">
        <span className="text-[14px] leading-none" style={{ color: `${color}88` }}>↓</span>
        <span className="text-[10px] leading-tight" style={{ color: dim }}>{text}</span>
      </div>
    </>
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
