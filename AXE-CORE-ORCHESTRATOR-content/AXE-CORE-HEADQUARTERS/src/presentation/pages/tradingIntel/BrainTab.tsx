/**
 * BrainTab — AXE ALGO's head. Thinking trace + memory log on the left
 * (what he's thinking and remembering), chat pinned bottom-right (where
 * you talk to him about it) — matches the original layout brief: logs
 * above, chat in the bottom-right corner.
 */
import { Loader2, Play } from 'lucide-react';
import { WidgetCard } from '@/presentation/components/widgets/WidgetCard';
import { TradingChatPanel } from './TradingChatPanel';
import { AgentOverviewPanel } from './AgentOverviewPanel';
import { AGENT_NAME, type TradingDeskState } from './useTradingDeskState';
import type { GlobalMemoryEntry } from '@/infrastructure/persistence/globalMemoryService';

/** Namespace → friendly label/color. Matches the ta:<agent>:<ns>:<id> key
 *  shape written by tradingAgentMemoryService.ts / tradingAgentBrain.ts. */
const NS_META: Record<string, { label: string; color: string }> = {
  cycle: { label: 'Decision', color: '#a78bfa' },
  decision: { label: 'Decision (executed)', color: '#6ee7b7' },
  lesson: { label: 'Lesson', color: '#f4c26e' },
  intel: { label: 'Intel snapshot', color: '#60a5fa' },
  thesis: { label: 'Thesis', color: '#c4b5fd' },
  mistake: { label: 'Mistake', color: '#fca5a5' },
  outcome: { label: 'Outcome', color: '#6ee7b7' },
};

function memoryNamespace(key: string): string {
  // ta:<agent>:<ns>:<rest>
  const parts = key.split(':');
  return parts.length >= 3 ? parts[2] : 'other';
}

/** Best-effort structured render of a memory entry's value — most are JSON
 *  (decisions/cycles/intel snapshots), some are plain text (lessons). */
function MemorySummary({ value }: { value: unknown }) {
  const raw = String(value);
  let parsed: Record<string, unknown> | null = null;
  try {
    const p = JSON.parse(raw);
    if (p && typeof p === 'object') parsed = p as Record<string, unknown>;
  } catch { /* plain text, not JSON */ }

  if (!parsed) {
    return <p className="text-[11px] leading-relaxed" style={{ color: 'rgba(255,255,255,0.5)' }}>{raw.slice(0, 320)}</p>;
  }

  const symbol = (parsed.symbol as string) ?? '';
  const action = (parsed.action as string) ?? (parsed.signal as string) ?? '';
  const confidence = typeof parsed.confidence === 'number' ? parsed.confidence : null;
  const text = (parsed.rationale as string) ?? (parsed.thesis as string) ?? (parsed.summary as string) ?? '';

  return (
    <div className="space-y-0.5">
      {(symbol || action || confidence != null) && (
        <div className="flex items-center gap-2 text-[10px] font-mono-data" style={{ color: 'rgba(255,255,255,0.55)' }}>
          {symbol && <span style={{ color: '#F5F0E6' }}>{symbol}</span>}
          {action && <span>{action.toUpperCase()}</span>}
          {confidence != null && <span>{(confidence * 100).toFixed(0)}%</span>}
        </div>
      )}
      {text && <p className="text-[11px] leading-relaxed line-clamp-3" style={{ color: 'rgba(255,255,255,0.45)' }}>{text.slice(0, 280)}</p>}
    </div>
  );
}

function MemoryEntryCard({ entry }: { entry: GlobalMemoryEntry }) {
  const ns = memoryNamespace(entry.key);
  const meta = NS_META[ns] ?? { label: ns, color: '#94A3B8' };
  const idPart = entry.key.split(':').slice(3).join(':');
  return (
    <div className="rounded p-1.5" style={{ background: 'rgba(255,255,255,0.04)' }}>
      <div className="flex items-center gap-1.5 mb-1">
        <span className="text-[9px] px-1.5 py-0.5 rounded-full uppercase tracking-wide" style={{ background: `${meta.color}22`, color: meta.color }}>
          {meta.label}
        </span>
        {idPart && <span className="text-[9px] font-mono-data" style={{ color: 'rgba(255,255,255,0.3)' }}>{idPart.slice(0, 24)}</span>}
        {entry.created_at && (
          <span className="text-[9px] font-mono-data ml-auto" style={{ color: 'rgba(255,255,255,0.3)' }}>
            {new Date(entry.created_at).toLocaleTimeString()}
          </span>
        )}
      </div>
      <MemorySummary value={entry.value} />
    </div>
  );
}

export function BrainTab({ desk }: { desk: TradingDeskState }) {
  const { lastTrace, memory, agentRunning, runAgent } = desk;

  return (
    <div className="flex flex-col lg:flex-row gap-3 h-full min-h-0 overflow-y-auto lg:overflow-visible">
      <div className="flex-1 min-w-0 min-h-0 flex flex-col gap-3 overflow-y-auto pr-1">
        <AgentOverviewPanel desk={desk} />

        <button
          type="button"
          disabled={agentRunning}
          onClick={() => void runAgent()}
          className="flex items-center gap-2 px-4 py-2 rounded-lg text-[13px] self-start shrink-0"
          style={{ background: 'rgba(52,211,153,0.15)', color: '#6ee7b7', border: '1px solid rgba(52,211,153,0.3)' }}
        >
          {agentRunning ? <Loader2 size={16} className="animate-spin" /> : <Play size={16} />}
          Run {AGENT_NAME} cycle
        </button>

        {lastTrace ? (
          <WidgetCard title={`Last thinking — ${lastTrace.symbol} · ${lastTrace.finalAction.toUpperCase()} · ${(lastTrace.confidence * 100).toFixed(0)}%`}>
            <div className="space-y-1.5">
              {lastTrace.steps.map((s, i) => (
                <div key={i} className="text-[11px] leading-relaxed" style={{ color: 'rgba(255,255,255,0.55)' }}>
                  <span className="font-mono-data" style={{ color: '#a78bfa' }}>[{s.phase}]</span> {s.detail}
                </div>
              ))}
            </div>
          </WidgetCard>
        ) : (
          <WidgetCard title="Last thinking">
            <p className="text-[11px]" style={{ color: 'rgba(255,255,255,0.35)' }}>No cycle run yet.</p>
          </WidgetCard>
        )}

        <WidgetCard title={`${AGENT_NAME}'s memory`}>
          <p className="text-[10px] mb-2" style={{ color: 'rgba(255,255,255,0.3)' }}>
            Isolated in its own namespace but stored in AXE's shared global memory — same brain as chat/Neural, filtered to just this agent — and mirrored into your Obsidian vault's Trading/ folder.
          </p>
          <div className="space-y-1">
            {memory.slice(0, 40).map(m => <MemoryEntryCard key={m.id} entry={m} />)}
            {!memory.length && <p className="text-[11px]" style={{ color: 'rgba(255,255,255,0.35)' }}>Empty</p>}
          </div>
        </WidgetCard>
      </div>

      <div className="w-full lg:w-[340px] shrink-0 min-h-0 h-[70vh] lg:h-auto">
        <TradingChatPanel desk={desk} />
      </div>
    </div>
  );
}
