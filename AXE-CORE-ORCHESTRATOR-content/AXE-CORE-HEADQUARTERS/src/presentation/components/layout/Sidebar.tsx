import {
  Globe, Code, FileCode, Wrench, Braces, ChevronLeft, ChevronRight, X,
  Activity, Cpu, Mic, Zap, Server, Lightbulb,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import { useUIStore } from '@/presentation/store/uiStore';
import { useIsMobile } from '@/presentation/hooks/use-mobile';
import { useIsTablet } from '@/presentation/hooks/use-tablet';
import { useVoiceStore } from '@/presentation/store/voiceStore';
import { getSupabase } from '@/infrastructure/supabase/supabaseClient';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/presentation/components/ui/sheet';
import { WidgetCard } from '@/presentation/components/widgets/WidgetCard';
import { ThinkThanksWidget } from '@/presentation/components/widgets/ThinkThanksWidget';
import { BrowserPanel } from '@/presentation/components/axe-core/BrowserPanel';
import { CodeAgentPanel } from '@/presentation/components/axe-core/CodeAgentPanel';
import { KimiToolsPanel } from '@/presentation/components/axe-core/KimiToolsPanel';
import { AICoreLogs } from '@/presentation/components/axe-core/AICoreLogs';
import { checkAxeApi } from '@/infrastructure/gateways/axeCoreApiService';
import { VPS_API_ORIGIN } from '@/infrastructure/config/apiUrl';

/** Compact system status — lives on the left so routing/logs sit underneath. */
function AICoreSystemLeft() {
  const [supaOk, setSupaOk] = useState<boolean | null>(null);
  const [llmCount, setLlmCount] = useState(0);
  const voice = useVoiceStore();

  useEffect(() => {
    try {
      const stored = localStorage.getItem('axe_llm_connections');
      if (stored) {
        const parsed = JSON.parse(stored) as Record<string, { key?: string }>;
        setLlmCount(Object.values(parsed).filter(c => c?.key && c.key.length > 4).length);
      }
    } catch { /* ignore */ }

    const ping = async () => {
      try {
        const sb = getSupabase();
        if (!sb) { setSupaOk(false); return; }
        const { error } = await sb.auth.getSession();
        setSupaOk(!error);
      } catch { setSupaOk(false); }
    };
    void ping();
  }, []);

  let tts = 'Fish Audio';
  try {
    const p = localStorage.getItem('axe_tts_provider');
    if (p === 'elevenlabs') tts = 'ElevenLabs';
    else if (p === 'browser') tts = 'Browser';
  } catch { /* ignore */ }

  const provider = voice.activeProvider || voice.primarySlot?.provider || '—';

  return (
    <div className="space-y-1.5">
      {[
        { icon: Activity, label: 'Status', val: llmCount > 0 ? 'Online' : 'No AI', ok: llmCount > 0 },
        { icon: Cpu, label: 'Primary', val: String(provider), ok: !!voice.activeProvider || !!voice.primarySlot },
        { icon: Mic, label: 'Voice', val: tts, ok: true },
        { icon: Zap, label: 'Memory', val: supaOk ? `OK · ${voice.conversation.length} msgs` : supaOk === null ? '…' : 'offline', ok: supaOk === true },
      ].map(({ icon: Icon, label, val, ok }) => (
        <div key={label} className="flex items-center justify-between gap-1">
          <div className="flex items-center gap-1.5 min-w-0">
            <Icon size={11} style={{ color: ok ? 'var(--accent-cyan)' : 'var(--text-muted)' }} />
            <span className="text-[10px]" style={{ color: 'var(--text-secondary)' }}>{label}</span>
          </div>
          <span className="text-[10px] font-mono truncate max-w-[100px]" style={{ color: ok ? 'var(--text-primary)' : 'var(--text-muted)' }}>
            {val}
          </span>
        </div>
      ))}
      <div className="text-[9px] font-mono pt-0.5" style={{ color: 'var(--text-muted)' }}>
        mode: {voice.voiceStatus}
      </div>
    </div>
  );
}

const OLLAMA_HEALTH_URL = (import.meta.env.VITE_OLLAMA_URL as string | undefined)
  ?? (import.meta.env.DEV ? '/proxy/ollama' : 'https://ollama.axecompanion.com');

type VpsPingState = { status: 'checking' | 'online' | 'degraded' | 'offline'; latencyMs: number | null; detail: string };

function VpsRow({ label, origin, state }: { label: string; origin: string; state: VpsPingState }) {
  const color =
    state.status === 'online' ? 'var(--success)'
      : state.status === 'degraded' ? 'var(--warning)'
        : state.status === 'checking' ? 'var(--text-muted)'
          : 'var(--error)';

  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <span
            className="inline-block rounded-full"
            style={{
              width: 7,
              height: 7,
              background: color,
              boxShadow: state.status === 'online' ? `0 0 8px ${color}` : 'none',
            }}
          />
          <span className="text-[10px] font-mono" style={{ color }}>
            {label} · {state.status.toUpperCase()}
          </span>
        </div>
        {state.latencyMs != null && (
          <span className="text-[9px] font-mono" style={{ color: 'var(--text-muted)' }}>
            {state.latencyMs} ms
          </span>
        )}
      </div>
      <div className="text-[10px]" style={{ color: 'var(--text-secondary)' }}>
        {state.detail}
      </div>
      <div className="text-[9px] font-mono pt-0.5" style={{ color: 'var(--text-muted)' }}>
        {origin.replace(/^https?:\/\//, '')}
      </div>
    </div>
  );
}

function VpsHealthWidget() {
  const [strato, setStrato] = useState<VpsPingState>({ status: 'checking', latencyMs: null, detail: 'probing…' });
  const [hetzner, setHetzner] = useState<VpsPingState>({ status: 'checking', latencyMs: null, detail: 'probing…' });
  const [gcp, setGcp] = useState<VpsPingState>({ status: 'checking', latencyMs: null, detail: 'probing…' });
  const [gcpConfigured, setGcpConfigured] = useState(false);

  useEffect(() => {
    let cancelled = false;

    const tickStrato = async () => {
      const t0 = performance.now();
      try {
        const health = await Promise.race([
          checkAxeApi(),
          new Promise<null>((_, reject) =>
            window.setTimeout(() => reject(new Error('timeout')), 6000),
          ),
        ]) as Awaited<ReturnType<typeof checkAxeApi>>;

        if (cancelled) return;
        const ms = Math.round(performance.now() - t0);

        const bits: string[] = [];
        if (health.supabase) bits.push('supabase');
        if (health.n8n) bits.push('n8n');
        if (health.github) bits.push('github');
        if (health.vercel) bits.push('vercel');

        if (health.status === 'ok' || health.status === 'healthy' || bits.length > 0) {
          setStrato({ status: 'online', latencyMs: ms, detail: bits.length ? bits.join(' · ') : 'API healthy' });
        } else {
          setStrato({ status: 'degraded', latencyMs: ms, detail: health.status || 'partial' });
        }
      } catch {
        if (cancelled) return;
        setStrato({ status: 'offline', latencyMs: null, detail: 'unreachable' });
      }
    };

    const tickHetzner = async () => {
      const t0 = performance.now();
      try {
        const res = await fetch(`${OLLAMA_HEALTH_URL}/api/tags`, { signal: AbortSignal.timeout(6000) });
        if (cancelled) return;
        const ms = Math.round(performance.now() - t0);
        if (!res.ok) {
          setHetzner({ status: 'degraded', latencyMs: ms, detail: `HTTP ${res.status}` });
          return;
        }
        const data = await res.json().catch(() => null);
        const modelCount = Array.isArray(data?.models) ? data.models.length : null;
        setHetzner({
          status: 'online',
          latencyMs: ms,
          detail: modelCount != null ? `ollama · ${modelCount} models` : 'ollama healthy',
        });
      } catch {
        if (cancelled) return;
        setHetzner({ status: 'offline', latencyMs: null, detail: 'unreachable' });
      }
    };

    const tickGcp = async () => {
      const t0 = performance.now();
      try {
        const res = await fetch(`${VPS_API_ORIGIN}/status/vps-agents`, { signal: AbortSignal.timeout(6000) });
        if (cancelled) return;
        const ms = Math.round(performance.now() - t0);
        if (!res.ok) {
          setGcp({ status: 'degraded', latencyMs: ms, detail: `HTTP ${res.status}` });
          return;
        }
        const data = await res.json().catch(() => null);
        const entry = data?.gcp_ollama as { configured?: boolean; reachable?: boolean; models?: number; latency_ms?: number } | undefined;
        if (!entry?.configured) {
          setGcpConfigured(false);
          setGcp({ status: 'offline', latencyMs: null, detail: 'not configured' });
        } else if (entry.reachable) {
          setGcpConfigured(true);
          setGcp({
            status: 'online',
            latencyMs: entry.latency_ms ?? ms,
            detail: entry.models != null ? `ollama · ${entry.models} models` : 'ollama healthy',
          });
        } else {
          setGcp({ status: 'offline', latencyMs: null, detail: 'unreachable' });
        }
      } catch {
        if (cancelled) return;
        setGcp({ status: 'offline', latencyMs: null, detail: 'unreachable' });
      }
    };

    const tick = () => { void tickStrato(); void tickHetzner(); void tickGcp(); };
    tick();
    const id = window.setInterval(tick, 30_000);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, []);

  return (
    <div className="space-y-3">
      <VpsRow label="Strato" origin={VPS_API_ORIGIN} state={strato} />
      <div style={{ height: 1, background: 'var(--border-subtle)' }} />
      <VpsRow label="Hetzner" origin={OLLAMA_HEALTH_URL} state={hetzner} />
      {gcpConfigured && (
        <>
          <div style={{ height: 1, background: 'var(--border-subtle)' }} />
          <VpsRow label="GCP" origin="trading-crew ollama" state={gcp} />
        </>
      )}
      <div className="text-[8px] font-mono" style={{ color: 'var(--text-muted)' }}>poll 30s</div>
    </div>
  );
}

const TOOL_CARD_STYLE = { minHeight: 160 } as const;

export function Sidebar() {
  const { leftDrawerOpen, setLeftDrawerOpen, leftPanelOpen, toggleLeftPanel } = useUIStore();
  const isMobile = useIsMobile();
  const isTablet = useIsTablet();
  const isCompact = isMobile || isTablet;

  const content = (
    <div className="h-full flex flex-col overflow-hidden">
      <div className="px-3 pt-3 pb-2 border-b border-white/5 flex-shrink-0 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Wrench size={14} style={{ color: 'var(--accent-cyan)' }} />
          <span className="text-[11px] font-semibold tracking-[0.12em] uppercase" style={{ color: 'var(--text-primary)' }}>
            Tools
          </span>
        </div>
        {isCompact ? (
          <button onClick={() => setLeftDrawerOpen(false)} className="p-1 rounded-md hover:bg-white/5" title="Close">
            <X size={16} style={{ color: 'var(--text-muted)' }} />
          </button>
        ) : (
          <button onClick={toggleLeftPanel} className="p-1 rounded-md hover:bg-white/5" title="Collapse">
            {leftPanelOpen ? <ChevronLeft size={14} style={{ color: 'var(--text-muted)' }} /> : <ChevronRight size={14} style={{ color: 'var(--text-muted)' }} />}
          </button>
        )}
      </div>

      <div className="flex-1 overflow-y-auto overflow-x-hidden px-2.5 pb-3 pt-2 space-y-2">
        <WidgetCard title="THINKTHANKS" icon={<Lightbulb size={12} style={{ color: 'var(--accent-cyan)' }} />}>
          <ThinkThanksWidget />
        </WidgetCard>

        <WidgetCard title="AI CORE SYSTEM" icon={<Activity size={12} style={{ color: 'var(--accent-cyan)' }} />}>
          <AICoreSystemLeft />
        </WidgetCard>

        <WidgetCard title="AI CORE LOGS" icon={<FileCode size={12} style={{ color: 'var(--accent-cyan)' }} />}>
          <div style={TOOL_CARD_STYLE}>
            <AICoreLogs />
          </div>
        </WidgetCard>

        <WidgetCard title="VPS HEALTH" icon={<Server size={12} style={{ color: 'var(--accent-cyan)' }} />}>
          <div style={TOOL_CARD_STYLE}>
            <VpsHealthWidget />
          </div>
        </WidgetCard>

        <WidgetCard title="CODE AGENT" icon={<Code size={12} style={{ color: 'var(--accent-cyan)' }} />}>
          <div style={TOOL_CARD_STYLE}>
            <CodeAgentPanel />
          </div>
        </WidgetCard>

        <WidgetCard title="BROWSER" icon={<Globe size={12} style={{ color: 'var(--accent-cyan)' }} />}>
          <div style={TOOL_CARD_STYLE}>
            <BrowserPanel />
          </div>
        </WidgetCard>

        <WidgetCard title="KIMI TOOLS" icon={<Braces size={12} style={{ color: 'var(--accent-cyan)' }} />}>
          <div style={TOOL_CARD_STYLE}>
            <KimiToolsPanel />
          </div>
        </WidgetCard>
      </div>
    </div>
  );

  if (isCompact) {
    return (
      <Sheet open={leftDrawerOpen} onOpenChange={setLeftDrawerOpen}>
        <SheetContent
          side="left"
          className="bg-black text-white border-r border-white/5 w-[280px] max-w-[85vw] p-0"
          style={{ backgroundColor: 'var(--bg-base)' }}
        >
          <SheetHeader className="sr-only">
            <SheetTitle>Tools</SheetTitle>
            <SheetDescription>THINKTHANKS, AI Core, logs, VPS Health, Code Agent, Browser, Kimi</SheetDescription>
          </SheetHeader>
          {content}
        </SheetContent>
      </Sheet>
    );
  }

  if (!leftPanelOpen) {
    return (
      <aside className="flex-shrink-0 flex flex-col items-center py-3" style={{ width: '36px' }}>
        <button onClick={toggleLeftPanel} className="p-1.5 rounded-md hover:bg-white/5 mb-2" title="Expand">
          <ChevronRight size={14} style={{ color: 'var(--accent-cyan)' }} />
        </button>
        <div className="w-px h-4 bg-white/10 mb-2" />
        <div className="flex flex-col items-center gap-3">
          <Lightbulb size={14} style={{ color: 'var(--text-muted)' }} />
          <Activity size={14} style={{ color: 'var(--text-muted)' }} />
          <FileCode size={14} style={{ color: 'var(--text-muted)' }} />
          <Server size={14} style={{ color: 'var(--text-muted)' }} />
          <Code size={14} style={{ color: 'var(--text-muted)' }} />
          <Globe size={14} style={{ color: 'var(--text-muted)' }} />
        </div>
      </aside>
    );
  }

  return (
    <aside className="flex-shrink-0 flex flex-col overflow-hidden" style={{ width: '240px' }}>
      {content}
    </aside>
  );
}
