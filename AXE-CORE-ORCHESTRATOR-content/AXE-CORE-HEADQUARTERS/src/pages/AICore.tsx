import { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Brain, Zap, Activity, Network, Database, MessageSquare, ChevronRight, Circle, Bot, Clock } from 'lucide-react';
import { HolographicSphere } from '@/components/axe-core/HolographicSphere';
import { WidgetCard } from '@/components/widgets/WidgetCard';
import { LiveIndicator } from '@/components/shared/LiveIndicator';
import { useVoiceStore, PROVIDERS, AXE_SYSTEM_PROMPT } from '@/store/voiceStore';
import { useUIStore } from '@/store/uiStore';

interface ThoughtEntry { id: string; ts: number; type: 'user' | 'axe' | 'system' | 'route'; text: string; }

function formatTime(ts: number) {
  const d = new Date(ts);
  return `${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}:${String(d.getSeconds()).padStart(2,'0')}`;
}

export default function AICore() {
  const voice = useVoiceStore();
  const { setRightPanelOpen } = useUIStore();
  const [thoughts, setThoughts] = useState<ThoughtEntry[]>([]);
  const streamRef = useRef<HTMLDivElement>(null);

  // Close AppShell right panel — AICore owns the layout
  useEffect(() => {
    setRightPanelOpen(false);
    return () => setRightPanelOpen(true);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Sync conversation to thought stream
  useEffect(() => {
    const entries: ThoughtEntry[] = voice.conversation.map(m => ({
      id: `${m.timestamp}-${m.role}`,
      ts: m.timestamp,
      type: m.role === 'user' ? 'user' : 'axe',
      text: m.text,
    }));
    setThoughts(entries);
  }, [voice.conversation]);

  useEffect(() => {
    if (streamRef.current) streamRef.current.scrollTop = streamRef.current.scrollHeight;
  }, [thoughts]);

  const primarySlot = voice.primarySlot;
  const primaryProvider = primarySlot ? PROVIDERS.find(p => p.id === primarySlot.provider) : null;
  const connectedSlots = [voice.primarySlot, voice.fallback1Slot, voice.fallback2Slot].filter(Boolean);
  const supaConnected = !!localStorage.getItem('axe_supa_url');
  const mcpCount = (() => { try { return JSON.parse(localStorage.getItem('axe_mcp_servers') ?? '[]').filter((s: {status: string}) => s.status === 'online').length; } catch { return 0; } })();
  const taskCount = (() => { try { return JSON.parse(localStorage.getItem('axe_tasks') ?? '[]').length; } catch { return 0; } })();
  const kbCount = (() => { try { return JSON.parse(localStorage.getItem('axe_kb_docs') ?? '[]').length; } catch { return 0; } })();

  const TYPE_CFG: Record<ThoughtEntry['type'], { color: string; prefix: string }> = {
    user:   { color: 'var(--accent-blue)', prefix: '→ YOU' },
    axe:    { color: 'var(--accent-cyan)', prefix: '◈ AXE' },
    system: { color: 'var(--text-muted)', prefix: '⬡ SYS' },
    route:  { color: 'var(--warning)', prefix: '⇢ ROUTE' },
  };

  return (
    <motion.div className="flex gap-3 p-3 h-full overflow-hidden" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>

      {/* ── LEFT: System Status ────────────────────────────────────── */}
      <div className="flex flex-col gap-2.5 w-[260px] flex-shrink-0 overflow-y-auto">
        <WidgetCard title="CORE STATUS" headerAction={<LiveIndicator size={6} />}>
          <div className="space-y-2">
            {[
              { icon: Brain,    label: 'Model',     val: primaryProvider?.name ?? '—',  note: primarySlot?.model ?? primaryProvider?.defaultModel ?? 'Not configured', ok: !!primarySlot },
              { icon: Network,  label: 'MCPs',      val: `${mcpCount}`,                 note: 'connected',          ok: mcpCount > 0 },
              { icon: Database, label: 'Memory',    val: supaConnected ? 'Linked' : '—', note: supaConnected ? 'Supabase' : 'Not connected', ok: supaConnected },
              { icon: Bot,      label: 'LLM Keys',  val: `${connectedSlots.length}/3`,   note: 'slots filled',       ok: connectedSlots.length > 0 },
              { icon: Zap,      label: 'Tasks',     val: `${taskCount}`,                note: 'in queue',           ok: taskCount > 0 },
              { icon: Brain,    label: 'KB Docs',   val: `${kbCount}`,                  note: 'knowledge entries',  ok: kbCount > 0 },
            ].map(({ icon: Icon, label, val, note, ok }) => (
              <div key={label} className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Icon size={12} style={{ color: ok ? 'var(--accent-cyan)' : 'var(--text-muted)' }} />
                  <span className="text-xs-custom" style={{ color: 'var(--text-secondary)' }}>{label}</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="rounded-full" style={{ width: 4, height: 4, background: ok ? 'var(--success)' : 'rgba(255,255,255,0.2)', display: 'inline-block' }} />
                  <span className="text-xs-custom font-mono-data" style={{ color: ok ? 'var(--text-primary)' : 'var(--text-muted)' }}>{val}</span>
                  <span className="text-[9px]" style={{ color: 'var(--text-muted)' }}>{note}</span>
                </div>
              </div>
            ))}
          </div>
        </WidgetCard>

        <WidgetCard title="ACTIVE PROVIDERS">
          {connectedSlots.length === 0 ? (
            <div className="text-xs-custom text-center py-2" style={{ color: 'var(--text-muted)' }}>
              No LLM connected<br />
              <a href="/settings" style={{ color: 'var(--accent-cyan)' }}>Settings → AI Config →</a>
            </div>
          ) : (
            <div className="space-y-1.5">
              {connectedSlots.map((slot, i) => {
                const cfg = PROVIDERS.find(p => p.id === slot!.provider);
                return (
                  <div key={i} className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="text-[9px] px-1 rounded font-mono-data" style={{ background: 'var(--bg-hover)', color: 'var(--text-muted)' }}>{i === 0 ? 'PRIMARY' : `FB${i}`}</span>
                      <span className="text-xs-custom" style={{ color: 'var(--text-primary)' }}>{cfg?.name ?? slot!.provider}</span>
                    </div>
                    <span className="rounded-full" style={{ width: 5, height: 5, background: 'var(--success)', display: 'inline-block' }} />
                  </div>
                );
              })}
            </div>
          )}
        </WidgetCard>

        <WidgetCard title="SYSTEM PROMPT" headerAction={<span className="text-[9px]" style={{ color: 'var(--text-muted)' }}>v2</span>}>
          <div className="text-[10px] font-mono-data leading-relaxed max-h-40 overflow-y-auto" style={{ color: 'var(--text-muted)', whiteSpace: 'pre-wrap' }}>
            {AXE_SYSTEM_PROMPT.slice(0, 400)}...
          </div>
        </WidgetCard>
      </div>

      {/* ── CENTER: 3D Core ────────────────────────────────────────── */}
      <div className="flex-1 flex flex-col min-w-0 min-h-0">
        <div className="relative flex-1 rounded-2xl overflow-hidden" style={{ background: '#000', border: '1px solid rgba(255,255,255,0.04)' }}>
          <div className="absolute top-3 left-4 flex items-center gap-2 z-10">
            <LiveIndicator size={6} />
            <span className="text-xs-custom font-mono-data" style={{ color: 'var(--accent-cyan)' }}>AXE CORE — COGNITIVE ENGINE</span>
          </div>
          <div className="absolute top-3 right-4 flex items-center gap-1.5 z-10">
            <span className="text-[10px] font-mono-data" style={{ color: voice.voiceStatus !== 'idle' ? 'var(--warning)' : 'var(--text-muted)' }}>
              {voice.voiceStatus.toUpperCase()}
            </span>
          </div>
          <div className="absolute inset-0">
            <HolographicSphere />
          </div>

          {/* Status overlay bottom */}
          <div className="absolute bottom-4 left-0 right-0 flex justify-center gap-4 z-10">
            {connectedSlots.length > 0 ? (
              <span className="text-[10px] font-mono-data px-3 py-1 rounded-full" style={{ background: 'rgba(34,211,238,0.1)', border: '1px solid rgba(34,211,238,0.2)', color: 'var(--accent-cyan)' }}>
                {primaryProvider?.name} · {primarySlot?.model ?? primaryProvider?.defaultModel}
              </span>
            ) : (
              <span className="text-[10px] font-mono-data px-3 py-1 rounded-full" style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', color: 'var(--text-muted)' }}>
                No LLM — Connect in Settings
              </span>
            )}
          </div>
        </div>
      </div>

      {/* ── RIGHT: Thought Stream ──────────────────────────────────── */}
      <div className="flex flex-col gap-2.5 w-[280px] flex-shrink-0 overflow-y-auto">
        <WidgetCard title="THOUGHT STREAM" headerAction={
          <div className="flex items-center gap-1.5">
            {voice.voiceStatus !== 'idle' && <span className="animate-pulse text-[9px]" style={{ color: 'var(--accent-cyan)' }}>LIVE</span>}
            {thoughts.length > 0 && (
              <button onClick={() => { voice.clearConversation(); setThoughts([]); }} className="text-[9px]" style={{ color: 'var(--text-muted)' }}>Clear</button>
            )}
          </div>
        }>
          <div ref={streamRef} className="space-y-1.5 max-h-[60vh] overflow-y-auto">
            {thoughts.length === 0 ? (
              <div className="flex flex-col items-center gap-2 py-6">
                <MessageSquare size={20} style={{ color: 'var(--text-muted)', opacity: 0.3 }} />
                <p className="text-[10px] text-center" style={{ color: 'var(--text-muted)' }}>
                  No thoughts yet<br />
                  Talk to AXE Core below
                </p>
              </div>
            ) : (
              thoughts.map(thought => (
                <AnimatePresence key={thought.id}>
                  <motion.div initial={{ opacity: 0, x: 6 }} animate={{ opacity: 1, x: 0 }} className="flex gap-2">
                    <span className="text-[8px] font-mono-data flex-shrink-0 mt-0.5 w-12" style={{ color: 'var(--text-muted)' }}>
                      {formatTime(thought.ts)}
                    </span>
                    <div className="flex-1">
                      <span className="text-[9px] font-mono-data font-bold" style={{ color: TYPE_CFG[thought.type].color }}>
                        {TYPE_CFG[thought.type].prefix}{' '}
                      </span>
                      <span className="text-[10px]" style={{ color: thought.type === 'axe' ? 'var(--text-primary)' : 'var(--text-secondary)' }}>
                        {thought.text}
                      </span>
                    </div>
                  </motion.div>
                </AnimatePresence>
              ))
            )}
            {voice.voiceStatus === 'processing' && (
              <div className="flex gap-1.5 items-center">
                <span className="text-[8px] font-mono-data w-12" style={{ color: 'var(--text-muted)' }}>{formatTime(Date.now())}</span>
                <span className="text-[9px] font-mono-data font-bold" style={{ color: 'var(--accent-cyan)' }}>◈ AXE </span>
                <span className="flex gap-0.5">
                  {[0, 1, 2].map(i => <span key={i} className="animate-pulse rounded-full" style={{ width: 4, height: 4, background: 'var(--accent-cyan)', animationDelay: `${i * 0.15}s`, display: 'inline-block' }} />)}
                </span>
              </div>
            )}
          </div>
        </WidgetCard>

        {voice.error && (
          <WidgetCard title="ERROR">
            <p className="text-[10px]" style={{ color: 'var(--error)' }}>{voice.error}</p>
          </WidgetCard>
        )}

        <WidgetCard title="ROUTING LOGIC">
          <div className="space-y-1.5 text-[10px]" style={{ color: 'var(--text-muted)' }}>
            {[
              { app: 'AXE Companion', triggers: 'personal, calendar, advice, schedule', color: '#10B981' },
              { app: 'AXE Intel',     triggers: 'research, market, analyze, find',       color: '#3B82F6' },
              { app: 'Trading OS',    triggers: 'trade, buy, sell, position, order',      color: '#F59E0B' },
              { app: 'AXE Core',      triggers: 'system, route, status, manage (default)', color: '#22D3EE' },
            ].map(r => (
              <div key={r.app} className="flex items-start gap-1.5">
                <ChevronRight size={10} style={{ color: r.color, flexShrink: 0, marginTop: 1 }} />
                <div>
                  <span className="font-medium" style={{ color: r.color }}>{r.app}</span>
                  <span> — {r.triggers}</span>
                </div>
              </div>
            ))}
          </div>
        </WidgetCard>
      </div>

    </motion.div>
  );
}
