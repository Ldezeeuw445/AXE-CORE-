/**
 * AI Core — de cognitive stream links, de widgets rechts, elk de helft.
 *
 * De stroom nam alles wat er over was (flex-1) en de widgets hingen in een
 * kolom van 340px tegen de rechterrand, met tekst van 8-9px die afgekapt werd.
 * De stroom was bovendien bijna altijd leeg: hij toonde alleen wat er gebeurde
 * terwijl de pagina open stond. Nu:
 *
 *   - de pagina staat in .axe-tabruimte (UI-MAATSTAF regel 2), met lucht
 *     boven en onder;
 *   - vanaf xl twee gelijke helften: stroom | widgets;
 *   - de widgets in een raster van twee kolommen, rijen 1fr / auto / 1fr,
 *     zodat ze dezelfde lijnen delen en lange inhoud IN de kaart schuift;
 *   - de stroom wordt opgebouwd uit het bewaarde gesprek en de routeringslog
 *     (aiCoreStroom.ts), dus bij openen staat de geschiedenis er al.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { TabRail } from '@/presentation/components/layout/useTabRail';
import { motion, AnimatePresence } from 'framer-motion';
import { Bot, Brain, Check, ChevronRight, Cpu, Database, MemoryStick, Network, Terminal, X, Zap } from 'lucide-react';
import { WidgetCard } from '@/presentation/components/widgets/WidgetCard';
import { LiveIndicator } from '@/presentation/components/shared/LiveIndicator';
import { SystemRegistryPanel } from '@/presentation/components/shared/SystemRegistryPanel';
import { useVoiceStore, PROVIDERS, AXE_SYSTEM_PROMPT } from '@/presentation/store/voiceStore';
import type { RoutingEvent } from '@/presentation/store/voiceStore';
import { loadSetting } from '@/infrastructure/persistence/userSettingsService';
import { getSupabase } from '@/infrastructure/supabase/supabaseClient';
import { bouwStroom, stroomTijd, type StroomRegel } from '@/presentation/pages/aiCoreStroom';

function ts() {
  const d = new Date();
  return `${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}:${String(d.getSeconds()).padStart(2,'0')}`;
}

export default function AICore() {
  const voice = useVoiceStore();
  const [linkedState, setLinkedState] = useState({ supa: false, mcp: 0, tasks: 0, kb: 0 });
  // Wat nergens bewaard wordt -- het "denkt na"-moment, "Conversation cleared"
  // -- komt hier binnen. De rest van de stroom is afgeleid (aiCoreStroom.ts).
  const [los, setLos] = useState<StroomRegel[]>([]);
  const [sinds, setSinds] = useState(0);
  const streamRef = useRef<HTMLDivElement>(null);

  const stroom = useMemo(
    () => bouwStroom(voice.conversation, voice.routingLog, los, { sinds }),
    [voice.conversation, voice.routingLog, los, sinds],
  );

  // Het "denkt na"-moment, op de overgang naar processing. Via subscribe en
  // niet via een effect op voiceStatus: dit is een gebeurtenis in de store,
  // geen afgeleide staat.
  useEffect(() => useVoiceStore.subscribe((s, prev) => {
    if (s.voiceStatus === 'processing' && prev.voiceStatus !== 'processing') {
      const at = Date.now();
      setLos(p => [...p, { id: `proc-${at}`, at, type: 'sys' as const, text: '⟳ AXE thinking…' }].slice(-50));
    }
  }), []);

  useEffect(() => {
    if (streamRef.current) streamRef.current.scrollTop = streamRef.current.scrollHeight;
  }, [stroom]);

  useEffect(() => {
    let alive = true;
    const refresh = async () => {
      const sb = getSupabase();
      // KB documents live in their own core_kb_documents table now (see
      // KnowledgeBase.tsx) — a head-count query is cheap even as it scales,
      // unlike loading the old full 'axe_kb_docs' blob just to read its length.
      const kbCountPromise = sb
        ? sb.from('core_kb_documents').select('id', { count: 'exact', head: true }).then(r => r.count ?? 0)
        : Promise.resolve(0);
      const [mcp, tasks, kbCount, supa] = await Promise.all([
        loadSetting<Array<{ status?: string }>>('axe_mcp_servers', []),
        loadSetting<Array<unknown>>('axe_tasks', []),
        kbCountPromise,
        loadSetting<string>('axe_supa_url', ''),
      ]);
      if (!alive) return;
      setLinkedState({
        supa: !!supa,
        mcp: mcp.filter(s => s.status === 'online' || s.status === 'configured').length,
        tasks: tasks.length,
        kb: kbCount,
      });
    };
    void refresh();
    return () => { alive = false; };
  }, []);

  const connectedSlots = [voice.primarySlot, voice.fallback1Slot, voice.fallback2Slot].filter(Boolean);
  const primaryCfg = voice.primarySlot ? PROVIDERS.find(p => p.id === voice.primarySlot!.provider) : null;
  // Short model label: strip org prefix and tag, e.g. "google/gemma-3-4b-it:free" → "gemma-3-4b-it"
  const shortModel = (model?: string) => model ? model.split('/').pop()?.split(':')[0] ?? model : null;
  const primaryLabel = primaryCfg
    ? `${primaryCfg.name}${voice.primarySlot?.model ? ' / ' + shortModel(voice.primarySlot.model) : ''}`
    : '—';
  // Memory is linked when the Supabase client is initialised (env vars present)
  const supaLinked = !!(import.meta.env.VITE_SUPABASE_URL && import.meta.env.VITE_SUPABASE_ANON_KEY) || linkedState.supa;

  const LOG_COLOR: Record<StroomRegel['type'], string> = {
    in:    'var(--accent-cyan)',
    out:   'var(--accent-cyan)',
    sys:   'var(--text-muted)',
    route: 'var(--warning)',
  };
  const LOG_TEXT: Record<StroomRegel['type'], string> = {
    in:    'var(--text-secondary)',
    out:   'var(--text-primary)',
    sys:   'var(--text-muted)',
    route: 'var(--text-muted)',
  };
  const LOG_PREFIX: Record<StroomRegel['type'], string> = {
    in:    '→ IN  ',
    out:   '◈ AXE ',
    sys:   '⬡ SYS ',
    route: '⇢ RTE ',
  };

  const mem = (performance as unknown as Record<string, unknown>).memory as Record<string, number> | undefined;
  const heapMB = mem ? Math.round(mem.usedJSHeapSize / 1048576) : null;

  return (
    <motion.div
      className="axe-tabruimte flex min-h-0 flex-1 flex-col overflow-y-auto pb-3 pt-5 xl:overflow-hidden"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
    >

      {/* ── LEFT: System status ─────────────────────────────────────── */}
      {/* De kolom van 230px is een schuifbalk geworden: dezelfde inhoud,
          maar hij kost pas breedte als je hem nodig hebt. */}
      <TabRail kant="links">
        <div className="flex flex-col gap-2.5 w-full xl:w-[230px] flex-shrink-0 overflow-visible xl:overflow-y-auto">
          <WidgetCard title="CORE STATUS" headerAction={<LiveIndicator size={6} />}>
            <div className="space-y-1.5">
              {[
                { icon: Brain,      label: 'Model',    val: primaryLabel,                              ok: !!primaryCfg },
                { icon: Network,    label: 'MCPs',     val: `${linkedState.mcp} connected`,           ok: linkedState.mcp > 0 },
                { icon: Database,   label: 'Memory',   val: supaLinked ? 'Linked' : 'Not linked',     ok: supaLinked },
                { icon: Bot,        label: 'LLM Keys', val: `${connectedSlots.length}/3 slots`,        ok: connectedSlots.length > 0 },
                { icon: Zap,        label: 'Tasks',    val: `${linkedState.tasks} queued`,            ok: linkedState.tasks > 0 },
                { icon: Brain,      label: 'KB',       val: `${linkedState.kb} docs`,                 ok: linkedState.kb > 0 },
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
                      <div className="flex flex-col flex-1 min-w-0">
                        <span className="text-[10px] truncate" style={{ color: 'var(--text-primary)' }}>{cfg?.name ?? slot!.provider}</span>
                        {slot!.model && (
                          <span className="text-[9px] truncate" style={{ color: 'var(--text-muted)' }}>{shortModel(slot!.model)}</span>
                        )}
                      </div>
                      <span className="rounded-full flex-shrink-0" style={{ width: 4, height: 4, background: 'var(--success)', display: 'inline-block' }} />
                    </div>
                  );
                })}
              </div>
            )}
          </WidgetCard>

          <WidgetCard title="ROUTING">
            <div className="space-y-1.5 text-[10px]" style={{ color: 'var(--text-muted)' }}>
              <div className="flex items-start gap-1.5">
                <ChevronRight size={9} style={{ color: 'var(--accent-cyan)', flexShrink: 0, marginTop: 1 }} />
                <div>
                  <span className="font-medium" style={{ color: 'var(--accent-cyan)' }}>LangGraph Orchestrator</span>
                  <span className="text-[9px]"> — smart capability router</span>
                  <div className="text-[9px]">Routes to the right specialist/model per query. See Architecture for live agents.</div>
                </div>
              </div>
            </div>
          </WidgetCard>
        </div>
      </TabRail>

      {/* Twee gelijke helften vanaf xl: de stroom | de widgets. Daaronder
          onder elkaar, en dan scrollt de pagina in plaats van de kaarten. */}
      <div className="grid flex-1 grid-cols-1 gap-3 xl:min-h-0 xl:grid-cols-2 xl:[grid-template-rows:minmax(0,1fr)]">

      {/* ── LEFT HALF: Cognitive stream ─────────────────────────────── */}
      <section
        className="flex min-h-[55vh] min-w-0 flex-col overflow-hidden xl:min-h-0"
        style={{ borderRadius: 'var(--radius)', background: 'var(--surface-bg)', border: '1px solid var(--border-subtle)' }}
      >
        {/* Stream header */}
        <div className="flex flex-shrink-0 items-center gap-2 px-4 py-2.5" style={{ borderBottom: '1px solid var(--border-subtle)' }}>
          <Terminal size={11} style={{ color: 'var(--accent-cyan)' }} />
          <span className="text-[10px] font-mono-data" style={{ color: 'var(--accent-cyan)' }}>AXE CORE — COGNITIVE STREAM</span>
          <div className="flex-1" />
          <LiveIndicator size={5} />
          <span className="text-[9px] font-mono-data" style={{ color: 'var(--text-muted)' }}>
            {voice.voiceStatus !== 'idle' ? voice.voiceStatus.toUpperCase() : 'IDLE'}
          </span>
        </div>

        {/* Stream */}
        <div ref={streamRef} className="flex-1 overflow-y-auto p-4 font-mono-data text-[11px] space-y-0.5" style={{ lineHeight: '1.7' }}>
          {stroom.length === 0 && voice.voiceStatus !== 'processing' && (
            // Eerlijk leeg: er is in dit gesprek nog niets gebeurd. Geen
            // opstartregels die klinken alsof er iets draait.
            <p className="pb-2 font-sans text-[12px]" style={{ color: 'var(--text-muted)' }}>
              No turns in this conversation yet. Every message, the model AXE answered through and
              each hand-off to a specialist lands here, earlier turns included.
            </p>
          )}
          <AnimatePresence initial={false}>
            {stroom.map(log => (
              <motion.div
                key={log.id}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: 0.15 }}
                className="flex gap-2"
              >
                <span style={{ color: 'var(--text-muted)', opacity: 0.6, flexShrink: 0 }}>{stroomTijd(log.at)}</span>
                <span style={{ color: LOG_COLOR[log.type], flexShrink: 0, whiteSpace: 'pre' }}>{LOG_PREFIX[log.type]}</span>
                <span className="min-w-0 break-words" style={{ color: LOG_TEXT[log.type] }}>
                  {log.text}
                </span>
              </motion.div>
            ))}
          </AnimatePresence>

          {/* Processing indicator */}
          {voice.voiceStatus === 'processing' && (
            <div className="flex gap-2">
              <span style={{ color: 'var(--text-muted)', opacity: 0.6 }}>{ts()}</span>
              <span style={{ color: 'var(--accent-cyan)' }}>◈ AXE</span>
              <span style={{ color: 'var(--text-muted)' }}>
                {[0,1,2].map(i => <span key={i} className="animate-pulse" style={{ animationDelay: `${i*0.2}s` }}>▪</span>)}
              </span>
            </div>
          )}
          {/* Cursor */}
          <div className="flex gap-2">
            <span style={{ color: 'var(--text-muted)', opacity: 0.6 }}>{ts()}</span>
            <span style={{ color: 'var(--accent-cyan)' }}>▌</span>
          </div>
        </div>
      </section>

      {/* ── RIGHT HALF: widgets ─────────────────────────────────────── */}
      {/* Twee kolommen, rijen 1fr / auto / 1fr: de twee lijsten bovenaan,
          de twee korte kaarten in het midden, de architectuurkaart over de
          volle breedte eronder. Elke kaart schuift zijn eigen inhoud. */}
      <div className="grid min-h-0 min-w-0 grid-cols-1 gap-3 sm:grid-cols-2 xl:[grid-template-rows:minmax(0,1fr)_auto_minmax(0,1fr)]">
        <WidgetCard title="ROUTER TRACE" className="max-h-[420px] xl:max-h-none">
          {voice.routingLog.length === 0 ? (
            <p className="text-[11px]" style={{ color: 'var(--text-muted)' }}>No routing decisions yet. Send a message to see how AXE routes it.</p>
          ) : (
            <div className="space-y-2">
              {(voice.routingLog as RoutingEvent[]).slice(0, 12).map(evt => (
                <div key={evt.id} className="rounded-lg px-2.5 py-2" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid var(--border-subtle)' }}>
                  {/* Header: time + capability + via + coalesce count */}
                  <div className="mb-1 flex flex-wrap items-center gap-x-1.5 gap-y-0.5">
                    <span className="text-[10px] font-mono uppercase" style={{ color: 'var(--warning)' }}>{evt.capability}</span>
                    <span className="text-[10px] font-mono" style={{ color: 'var(--text-muted)' }}>· {evt.via}</span>
                    {(evt.count ?? 1) > 1 && (
                      <span className="text-[10px] font-mono" style={{ color: 'var(--warning)' }}>×{evt.count}</span>
                    )}
                    <span className="ml-auto text-[10px] font-mono" style={{ color: 'var(--text-muted)' }}>{stroomTijd(evt.ts)}</span>
                  </div>
                  {/* Query preview -- twee regels in plaats van één afgekapte. */}
                  <p className="mb-1 line-clamp-2 break-words text-[11px]" style={{ color: 'var(--text-secondary)' }}>&ldquo;{evt.query}&rdquo;</p>
                  {/* Per-slot attempts */}
                  <div className="space-y-0.5">
                    {evt.attempts.map((a, i) => (
                      <div key={i} className="flex flex-wrap items-center gap-x-1 text-[10px] font-mono">
                        <span style={{ color: a.outcome === 'ok' ? 'var(--success)' : 'var(--error)', flexShrink: 0 }}>{a.outcome === 'ok' ? <Check size={10} /> : <X size={10} />}</span>
                        <span className="min-w-0 break-all" style={{ color: a.outcome === 'ok' ? 'var(--text-primary)' : 'var(--text-muted)' }}>
                          {a.provider}{a.model ? `/${a.model.split('/').pop()?.split(':')[0]}` : ''}
                        </span>
                        {a.err && <span className="ml-auto" style={{ color: 'var(--error)' }}>{a.err}</span>}
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </WidgetCard>

        <WidgetCard
          title="SYSTEM PROMPT"
          className="max-h-[420px] xl:max-h-none"
          headerAction={<span className="text-[10px]" style={{ color: 'var(--text-muted)' }}>v2 · read-only</span>}
        >
          <pre className="text-[10px] font-mono-data leading-relaxed" style={{ color: 'var(--text-secondary)', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
            {AXE_SYSTEM_PROMPT}
          </pre>
        </WidgetCard>

        <WidgetCard title="CONVERSATION STATS">
          <div className="space-y-1.5">
            {[
              { label: 'Total messages', val: voice.conversation.length },
              { label: 'User messages',  val: voice.conversation.filter(m => m.role === 'user').length },
              { label: 'AXE responses',  val: voice.conversation.filter(m => m.role === 'axe').length },
              { label: 'Stream lines',   val: stroom.length },
            ].map(({ label, val }) => (
              <div key={label} className="flex justify-between gap-2">
                <span className="text-[11px]" style={{ color: 'var(--text-muted)' }}>{label}</span>
                <span className="text-[11px] font-mono-data" style={{ color: 'var(--text-primary)' }}>{val}</span>
              </div>
            ))}
          </div>
          {voice.conversation.length > 0 && (
            <button
              onClick={() => {
                const at = Date.now();
                voice.clearConversation();
                setSinds(at);
                setLos([{ id: `clear-${at}`, at, type: 'sys', text: 'Conversation cleared' }]);
              }}
              className="mt-2 w-full text-left text-[10px]" style={{ color: 'var(--text-muted)' }}>
              Clear conversation →
            </button>
          )}
        </WidgetCard>

        <WidgetCard title="ACTIVE ERROR">
          {voice.error ? (
            <p className="break-words text-[11px]" style={{ color: 'var(--error)', lineHeight: 1.6 }}>{voice.error}</p>
          ) : (
            <div className="flex items-center gap-1.5 py-1">
              <span className="rounded-full" style={{ width: 5, height: 5, background: 'var(--success)', display: 'inline-block' }} />
              <span className="text-[11px]" style={{ color: 'var(--success)' }}>No errors</span>
            </div>
          )}
        </WidgetCard>

        {/* De architectuurkaart heeft de langste namen, dus de volle breedte.
            Het omhulsel is een raster zodat de kaart zijn cel vult en zelf
            schuift, in plaats van de rij op te rekken. */}
        <div className="grid h-[420px] min-h-0 min-w-0 [grid-template-rows:minmax(0,1fr)] sm:col-span-2 xl:h-auto">
          <SystemRegistryPanel />
        </div>
      </div>

      </div>
    </motion.div>
  );
}
