import { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Brain, Zap, Network, Database, MessageSquare, ChevronRight,
  Bot, Activity, Terminal, Circle, Cpu, MemoryStick,
} from 'lucide-react';
import { WidgetCard } from '@/components/widgets/WidgetCard';
import { LiveIndicator } from '@/components/shared/LiveIndicator';
import { useVoiceStore, PROVIDERS, AXE_SYSTEM_PROMPT } from '@/store/voiceStore';
import { useUIStore } from '@/store/uiStore';
import { loadLogs, type CoreLogEntry } from '@/services/coreDB';

function ts() {
  const d = new Date();
  return `${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}:${String(d.getSeconds()).padStart(2,'0')}.${String(d.getMilliseconds()).padStart(3,'0')}`;
}

interface LogEntry { id: string; t: string; type: 'in' | 'out' | 'sys' | 'route'; text: string; }

export default function AICore() {
  const voice = useVoiceStore();
  const { setRightPanelOpen } = useUIStore();
  const [routeLogs, setRouteLogs] = useState<CoreLogEntry[]>([]);
  const [logs, setLogs] = useState<LogEntry[]>([
    { id: '0', t: ts(), type: 'sys', text: 'AXE CORE v2.0 — cognitive engine initialised' },
    { id: '1', t: ts(), type: 'sys', text: 'System prompt loaded · routing rules active' },
    { id: '2', t: ts(), type: 'sys', text: 'Waiting for LLM connection...' },
  ]);
  const streamRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setRightPanelOpen(false);
    return () => setRightPanelOpen(true);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Mirror conversation to logs
  useEffect(() => {
    if (voice.conversation.length === 0) return;
    const last = voice.conversation[voice.conversation.length - 1];
    const entry: LogEntry = {
      id: `${last.timestamp}-${last.role}`,
      t: new Date(last.timestamp).toISOString().slice(11, 23),
      type: last.role === 'user' ? 'in' : 'out',
      text: last.text,
    };
    setLogs(prev => {
      if (prev.some(l => l.id === entry.id)) return prev;
      return [...prev, entry].slice(-200);
    });
  }, [voice.conversation]);

  // Mirror voiceStatus to logs
  useEffect(() => {
    if (voice.voiceStatus === 'processing') {
      setLogs(prev => [...prev, { id: `proc-${Date.now()}`, t: ts(), type: 'sys' as const, text: '⟳ Processing... routing to LLM' }].slice(-200));
    }
  }, [voice.voiceStatus]);

  useEffect(() => {
    if (streamRef.current) streamRef.current.scrollTop = streamRef.current.scrollHeight;
  }, [logs]);

  useEffect(() => {
    let alive = true;
    const refresh = async () => {
      const entries = await loadLogs(40).catch(() => []);
      if (!alive) return;
      setRouteLogs(entries.filter(e => ['axe-core-router', 'axe-core-voice'].includes(e.source)));
    };
    refresh();
    const timer = setInterval(refresh, 5000);
    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, []);

  const connectedSlots = [voice.primarySlot, voice.fallback1Slot, voice.fallback2Slot].filter(Boolean);
  const primaryCfg = voice.primarySlot ? PROVIDERS.find(p => p.id === voice.primarySlot!.provider) : null;
  const supaConnected = !!localStorage.getItem('axe_supa_url');
  const mcpCount = (() => { try { return JSON.parse(localStorage.getItem('axe_mcp_servers') ?? '[]').filter((s: {status:string}) => s.status === 'online').length; } catch { return 0; } })();
  const taskCount = (() => { try { return JSON.parse(localStorage.getItem('axe_tasks') ?? '[]').length; } catch { return 0; } })();
  const kbCount = (() => { try { return JSON.parse(localStorage.getItem('axe_kb_docs') ?? '[]').length; } catch { return 0; } })();

  const LOG_COLOR: Record<LogEntry['type'], string> = {
    in:    '#22d3ee',
    out:   '#a5f3fc',
    sys:   'rgba(255,255,255,0.25)',
    route: '#fbbf24',
  };
  const LOG_PREFIX: Record<LogEntry['type'], string> = {
    in:    '→ IN ',
    out:   '◈ AXE',
    sys:   '⬡ SYS',
    route: '⇢ RTE',
  };

  const mem = (performance as unknown as Record<string, unknown>).memory as Record<string, number> | undefined;
  const heapMB = mem ? Math.round(mem.usedJSHeapSize / 1048576) : null;
  const coreMB = mem ? Math.round(mem.totalJSHeapSize / 1048576) : null;

  return (
    <motion.div className="flex gap-3 p-3 h-full overflow-hidden" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>

      {/* ── LEFT: System status ─────────────────────────────────────── */}
      <div className="flex flex-col gap-2.5 w-[230px] flex-shrink-0 overflow-y-auto">
        <WidgetCard title="CORE STATUS" headerAction={<LiveIndicator size={6} />}>
          <div className="space-y-1.5">
            {[
              { icon: Brain,      label: 'Model',    val: primaryCfg?.name ?? '—',                  ok: !!primaryCfg },
              { icon: Network,    label: 'MCPs',     val: `${mcpCount} online`,                     ok: mcpCount > 0 },
              { icon: Database,   label: 'Memory',   val: supaConnected ? 'Linked' : 'Not linked',  ok: supaConnected },
              { icon: Bot,        label: 'LLM Keys', val: `${connectedSlots.length}/3 slots`,        ok: connectedSlots.length > 0 },
              { icon: Zap,        label: 'Tasks',    val: `${taskCount} queued`,                    ok: taskCount > 0 },
              { icon: Brain,      label: 'KB',       val: `${kbCount} docs`,                        ok: kbCount > 0 },
              { icon: Cpu,        label: 'Heap',     val: heapMB ? `${heapMB} MB` : '—',            ok: !!heapMB },
              { icon: MemoryStick,label: 'Cores',    val: `${navigator.hardwareConcurrency ?? '—'}`,ok: true },
            ].map(({ icon: Icon, label, val, ok }) => (
              <div key={label} className="flex items-center justify-between">
                <div className="flex items-center gap-1.5">
                  <Icon size={11} style={{ color: ok ? 'var(--accent-cyan)' : 'var(--text-muted)' }} />
                  <span className="text-[10px]" style={{ color: 'var(--text-secondary)' }}>{label}</span>
                </div>
                <span className="text-[10px] font-mono-data" style={{ color: ok ? 'var(--text-primary)' : 'var(--text-muted)' }}>{val}</span>
              </div>
            ))}
          </div>
        </WidgetCard>

        <WidgetCard title="LLM SLOTS">
          {connectedSlots.length === 0 ? (
            <div className="text-[10px] py-1 text-center" style={{ color: 'var(--text-muted)' }}>
              No LLM connected<br />
              <a href="/settings" style={{ color: 'var(--accent-cyan)' }}>Settings → AI Config</a>
            </div>
          ) : (
            <div className="space-y-1.5">
              {connectedSlots.map((slot, i) => {
                const cfg = PROVIDERS.find(p => p.id === slot!.provider);
                return (
                  <div key={i} className="flex items-center gap-2">
                    <span className="text-[8px] px-1 rounded font-mono-data flex-shrink-0" style={{ background: 'var(--bg-hover)', color: 'var(--text-muted)' }}>
                      {i === 0 ? 'PRI' : `FB${i}`}
                    </span>
                    <span className="text-[10px] flex-1 truncate" style={{ color: 'var(--text-primary)' }}>{cfg?.name ?? slot!.provider}</span>
                    <span className="rounded-full" style={{ width: 4, height: 4, background: 'var(--success)', display: 'inline-block' }} />
                  </div>
                );
              })}
            </div>
          )}
        </WidgetCard>

        <WidgetCard title="ROUTING RULES">
          <div className="space-y-1.5 text-[10px]" style={{ color: 'var(--text-muted)' }}>
            {[
              { app: 'Companion', kw: 'personal, calendar, advice', color: '#10B981' },
              { app: 'Intel',     kw: 'research, market, analyze', color: '#3B82F6' },
              { app: 'Trading OS',kw: 'trade, buy, sell, order',   color: '#F59E0B' },
              { app: 'AXE Core',  kw: 'system, route (default)',    color: '#22D3EE' },
            ].map(r => (
              <div key={r.app} className="flex items-start gap-1.5">
                <ChevronRight size={9} style={{ color: r.color, flexShrink: 0, marginTop: 1 }} />
                <div>
                  <span className="font-medium" style={{ color: r.color }}>{r.app}</span>
                  <span className="text-[9px]"> — {r.kw}</span>
                </div>
              </div>
            ))}
          </div>
        </WidgetCard>
      </div>

      {/* ── CENTER: Thought stream terminal ─────────────────────────── */}
      <div className="flex-1 flex flex-col min-w-0 min-h-0 rounded-2xl overflow-hidden" style={{ background: '#030a0a', border: '1px solid rgba(34,211,238,0.1)' }}>
        {/* Terminal header */}
        <div className="flex items-center gap-2 px-4 py-2.5 flex-shrink-0" style={{ borderBottom: '1px solid rgba(34,211,238,0.08)' }}>
          <div className="flex gap-1.5">
            <span className="rounded-full" style={{ width: 10, height: 10, background: 'rgba(255,59,48,0.7)', display: 'inline-block' }} />
            <span className="rounded-full" style={{ width: 10, height: 10, background: 'rgba(255,196,0,0.7)', display: 'inline-block' }} />
            <span className="rounded-full" style={{ width: 10, height: 10, background: 'rgba(50,215,75,0.7)', display: 'inline-block' }} />
          </div>
          <div className="flex items-center gap-2 ml-2">
            <Terminal size={11} style={{ color: 'var(--accent-cyan)' }} />
            <span className="text-[10px] font-mono-data" style={{ color: 'var(--accent-cyan)' }}>AXE CORE — COGNITIVE STREAM</span>
          </div>
          <div className="flex-1" />
          <LiveIndicator size={5} />
          <span className="text-[9px] font-mono-data" style={{ color: 'var(--text-muted)' }}>
            {voice.voiceStatus !== 'idle' ? voice.voiceStatus.toUpperCase() : 'IDLE'}
          </span>
        </div>

        {/* Stream */}
        <div ref={streamRef} className="flex-1 overflow-y-auto p-4 font-mono-data text-[11px] space-y-0.5" style={{ lineHeight: '1.7' }}>
          <AnimatePresence initial={false}>
            {logs.map(log => (
              <motion.div
                key={log.id}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: 0.15 }}
                className="flex gap-2"
              >
                <span style={{ color: 'rgba(255,255,255,0.15)', flexShrink: 0 }}>{log.t}</span>
                <span style={{ color: LOG_COLOR[log.type], flexShrink: 0 }}>{LOG_PREFIX[log.type]}</span>
                <span style={{ color: log.type === 'out' ? 'rgba(255,255,255,0.85)' : log.type === 'in' ? 'rgba(165,243,252,0.8)' : 'rgba(255,255,255,0.3)' }}>
                  {log.text}
                </span>
              </motion.div>
            ))}
          </AnimatePresence>

          {/* Processing indicator */}
          {voice.voiceStatus === 'processing' && (
            <div className="flex gap-2">
              <span style={{ color: 'rgba(255,255,255,0.15)' }}>{ts()}</span>
              <span style={{ color: '#a5f3fc' }}>◈ AXE</span>
              <span style={{ color: 'rgba(255,255,255,0.5)' }}>
                {[0,1,2].map(i => <span key={i} className="animate-pulse" style={{ animationDelay: `${i*0.2}s` }}>▪</span>)}
              </span>
            </div>
          )}
          {/* Cursor */}
          <div className="flex gap-2">
            <span style={{ color: 'rgba(255,255,255,0.15)' }}>{ts()}</span>
            <span style={{ color: 'var(--accent-cyan)' }}>▌</span>
          </div>
        </div>
      </div>

      {/* ── RIGHT: System prompt + stats ────────────────────────────── */}
      <div className="flex flex-col gap-2.5 w-[240px] flex-shrink-0 overflow-y-auto">
        <WidgetCard title="SYSTEM PROMPT" headerAction={<span className="text-[9px]" style={{ color: 'var(--text-muted)' }}>v2 · read-only</span>}>
          <pre className="text-[9px] font-mono-data leading-relaxed max-h-52 overflow-y-auto" style={{ color: 'rgba(165,243,252,0.45)', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
            {AXE_SYSTEM_PROMPT}
          </pre>
        </WidgetCard>

        <WidgetCard title="CONVERSATION STATS">
          <div className="space-y-1.5">
            {[
              { label: 'Total messages', val: voice.conversation.length },
              { label: 'User messages',  val: voice.conversation.filter(m => m.role === 'user').length },
              { label: 'AXE responses',  val: voice.conversation.filter(m => m.role === 'axe').length },
              { label: 'Log entries',    val: logs.length },
            ].map(({ label, val }) => (
              <div key={label} className="flex justify-between">
                <span className="text-[10px]" style={{ color: 'var(--text-muted)' }}>{label}</span>
                <span className="text-[10px] font-mono-data" style={{ color: 'var(--text-primary)' }}>{val}</span>
              </div>
            ))}
          </div>
          {voice.conversation.length > 0 && (
            <button onClick={() => { voice.clearConversation(); setLogs([{ id: Date.now().toString(), t: ts(), type: 'sys', text: 'Conversation cleared' }]); }}
              className="mt-2 text-[9px] w-full text-left" style={{ color: 'var(--text-muted)' }}>
              Clear conversation →
            </button>
          )}
        </WidgetCard>

        <WidgetCard title="ACTIVE ERROR">
          {voice.error ? (
            <p className="text-[10px]" style={{ color: 'var(--error)', lineHeight: 1.6 }}>{voice.error}</p>
          ) : (
            <div className="flex items-center gap-1.5 py-1">
              <span className="rounded-full" style={{ width: 5, height: 5, background: 'var(--success)', display: 'inline-block' }} />
              <span className="text-[10px]" style={{ color: 'var(--success)' }}>No errors</span>
            </div>
          )}
        </WidgetCard>

        <WidgetCard title="ROUTER TRACE">
          {routeLogs.length === 0 ? (
            <p className="text-[10px]" style={{ color: 'var(--text-muted)' }}>Waiting for route logs…</p>
          ) : (
            <div className="space-y-1.5 max-h-44 overflow-y-auto">
              {routeLogs.slice(0, 8).map(entry => (
                <div key={entry.id} className="rounded-lg px-2 py-1.5" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}>
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[9px] uppercase font-mono" style={{ color: entry.source === 'axe-core-router' ? '#22D3EE' : '#A5F3FC' }}>
                      {entry.source}
                    </span>
                    <span className="text-[9px]" style={{ color: 'var(--text-muted)' }}>
                      {new Date(entry.created_at).toISOString().slice(11, 19)}
                    </span>
                  </div>
                  <p className="text-[10px] mt-1" style={{ color: 'var(--text-primary)', lineHeight: 1.5 }}>
                    {entry.message}
                  </p>
                </div>
              ))}
            </div>
          )}
        </WidgetCard>
      </div>

    </motion.div>
  );
}
