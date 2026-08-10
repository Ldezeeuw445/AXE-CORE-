/**
 * BrainTab — the agent's head. Thinking trace + memory log on the left
 * (what he's thinking and remembering), chat pinned bottom-right (where
 * you talk to him about it) — matches the original layout brief: logs
 * above, chat in the bottom-right corner.
 */
import { Loader2, Play } from 'lucide-react';
import { WidgetCard } from '@/presentation/components/widgets/WidgetCard';
import { TradingChatPanel } from './TradingChatPanel';
import type { TradingDeskState } from './useTradingDeskState';

export function BrainTab({ desk }: { desk: TradingDeskState }) {
  const { lastTrace, memory, agentRunning, runAgent } = desk;

  return (
    <div className="flex gap-3 h-full min-h-0">
      <div className="flex-1 min-w-0 min-h-0 flex flex-col gap-3 overflow-y-auto pr-1">
        <button
          type="button"
          disabled={agentRunning}
          onClick={() => void runAgent()}
          className="flex items-center gap-2 px-4 py-2 rounded-lg text-[13px] self-start shrink-0"
          style={{ background: 'rgba(52,211,153,0.15)', color: '#6ee7b7', border: '1px solid rgba(52,211,153,0.3)' }}
        >
          {agentRunning ? <Loader2 size={16} className="animate-spin" /> : <Play size={16} />}
          Run trading agent cycle
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

        <WidgetCard title="Agent memory">
          <div className="space-y-1">
            {memory.slice(0, 40).map(m => (
              <div key={m.id} className="rounded p-1.5 text-[11px]" style={{ background: 'rgba(255,255,255,0.04)' }}>
                <div style={{ color: '#f472b6' }}>{m.key.replace(/^ta:[^:]+:/, '')}</div>
                <div style={{ color: 'rgba(255,255,255,0.45)' }} className="line-clamp-3">{String(m.value).slice(0, 320)}</div>
              </div>
            ))}
            {!memory.length && <p className="text-[11px]" style={{ color: 'rgba(255,255,255,0.35)' }}>Empty</p>}
          </div>
        </WidgetCard>
      </div>

      <div className="w-[340px] shrink-0 min-h-0">
        <TradingChatPanel desk={desk} />
      </div>
    </div>
  );
}
