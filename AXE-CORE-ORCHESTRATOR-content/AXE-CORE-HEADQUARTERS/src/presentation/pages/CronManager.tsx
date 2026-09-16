import { useEffect, useState, useRef, useCallback } from 'react';
import { TopbalkSlot } from '@/presentation/components/layout/TopbalkSlot';
import { useSearchParams } from 'react-router';
import { motion, AnimatePresence } from 'framer-motion';
import { LIST_GRID } from '@/presentation/components/surface/Page';
import { NAAST_CORE, appVan, appMeta as appInfo, type AppId } from '@/domain/apps';
import { CronTabel, type TabelActies, type KolomTekst } from './cron/CronTabel';
import { toast } from '@/presentation/components/shared/toast';
import { AlertCircle, Bot, Globe, MessageSquare, Plus, RefreshCw, Terminal, Workflow, X } from 'lucide-react';
import {
  cronListSchedules, cronCreateSchedule, cronUpdateSchedule, cronDeleteSchedule,
  cronRunNow, type CronSchedule, type CronActionType,
} from '@/infrastructure/gateways/axeCoreApiService';

/* ── Human-readable cron ─────────────────────────────────────────────────── */
const CRON_PRESETS: Array<{ label: string; expr: string }> = [
  { label: 'Elke 15 min', expr: '*/15 * * * *' },
  { label: 'Elk uur', expr: '0 * * * *' },
  { label: 'Dagelijks 08:00', expr: '0 8 * * *' },
  { label: 'Dagelijks 18:00', expr: '0 18 * * *' },
  { label: 'Ma 09:00', expr: '0 9 * * 1' },
  { label: 'Elke maandag', expr: '0 9 * * 1' },
];

function cronToHuman(expr: string): string {
  const map: Record<string, string> = {
    '*/15 * * * *': 'elke 15 minuten',
    '*/5 * * * *': 'elke 5 minuten',
    '0 * * * *': 'elk uur',
    '0 8 * * *': 'dagelijks om 08:00',
    '0 18 * * *': 'dagelijks om 18:00',
    '0 9 * * 1': 'elke maandag om 09:00',
    '0 0 * * *': 'dagelijks om middernacht',
  };
  return map[expr.trim()] ?? expr;
}

const ACTION_META: Record<CronActionType, { label: string; icon: typeof Bot; color: string }> = {
  prompt:  { label: 'AXE Prompt', icon: MessageSquare, color: 'var(--accent-cyan)' },
  crew:    { label: 'CrewAI',     icon: Bot,           color: '#a78bfa' },
  flow:    { label: 'CrewAI Flow', icon: Workflow,     color: '#c4b5fd' },
  exec:    { label: 'VPS Command', icon: Terminal,     color: 'var(--warning)' },
  webhook: { label: 'Webhook',    icon: Globe,         color: 'var(--success)' },
  observed: { label: 'Draait elders', icon: Workflow,  color: 'var(--text-muted)' },
  planner: { label: 'Planner (Mac)', icon: Bot,        color: '#F472B6' },
  northsea: { label: 'NorthSea-desk', icon: Globe,     color: '#F472B6' },
};

/* ── App tabs ─────────────────────────────────────────────────────────────
 * Each schedule is tagged with metadata.app so cron jobs for AXE Core, AXE
 * Companion and Trading OS stay cleanly separated. AXE Core runs its jobs
 * locally (prompt/crew/exec); the two external apps are driven via a webhook
 * carrying your CRON_KEY — the self-hosted pattern you already use. */
/**
 * De apps staan in domain/apps.ts -- gedeeld met de taken-tab.
 *
 * Ze stonden hier, voor deze pagina alleen. Toen de taken-tab dezelfde
 * groepering nodig had zouden de id's uit elkaar gaan lopen, en dat is geen
 * zichtbare fout: een rij valt gewoon in de verkeerde kolom.
 */
const NAAST_ELKAAR = NAAST_CORE;

function scheduleApp(s: CronSchedule): AppId {
  return appVan(s.metadata);
}

/** A fresh draft seeded for the given app: external apps default to a
 *  cron-key webhook, AXE Core to a prompt. */
function draftForApp(app: AppId): Draft {
  if (app === 'axe_core') return { ...EMPTY_DRAFT };
  return { ...EMPTY_DRAFT, action_type: 'webhook', method: 'POST', includeCronKey: true };
}

function fmt(dt: string | null): string {
  if (!dt) return '—';
  return new Date(dt).toLocaleString('en-US', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
}

type Draft = {
  name: string;
  cron_expr: string;
  action_type: CronActionType;
  // per-action fields (flattened for the form)
  prompt: string;
  command: string;
  url: string;
  method: string;
  bodyJson: string;
  includeCronKey: boolean;
  flowName: string;
  flowAsset: string;
  flowTopic: string;
  flowDepth: string;
};

const EMPTY_DRAFT: Draft = {
  name: '', cron_expr: '0 8 * * *', action_type: 'prompt',
  prompt: '', command: '', url: '', method: 'POST', bodyJson: '', includeCronKey: false,
  flowName: 'trading_intelligence', flowAsset: 'XAUUSD', flowTopic: 'daily research cycle', flowDepth: 'standard',
};

function draftToPayload(d: Draft): Record<string, unknown> {
  switch (d.action_type) {
    case 'prompt': return { prompt: d.prompt };
    case 'crew':   return { task: d.prompt };
    case 'exec':   return { command: d.command, timeout: 120 };
    case 'webhook': {
      let body: unknown;
      if (d.bodyJson.trim()) { try { body = JSON.parse(d.bodyJson); } catch { body = d.bodyJson; } }
      return { url: d.url, method: d.method, body, include_cron_key: d.includeCronKey };
    }
    case 'flow':
      return { flow: d.flowName, inputs: { asset: d.flowAsset, topic: d.flowTopic, depth: d.flowDepth } };
    default: return {};
  }
}

export default function CronManager() {
  const [schedules, setSchedules] = useState<CronSchedule[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<Set<string>>(new Set());
  const [adding, setAdding] = useState(false);
  const [activeApp, setActiveApp] = useState<AppId>('axe_core');
  const [draft, setDraft] = useState<Draft>(EMPTY_DRAFT);

  const [searchParams, setSearchParams] = useSearchParams();
  const openId = searchParams.get('open');
  const cardRefs = useRef<Record<string, HTMLDivElement | null>>({});

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setSchedules(await cronListSchedules());
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load schedules');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  // Deep-link: ?open=<id> scrolls to a schedule.
  useEffect(() => {
    if (!openId || loading) return;
    cardRefs.current[openId]?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    const next = new URLSearchParams(searchParams); next.delete('open');
    setSearchParams(next, { replace: true });
  }, [openId, loading, searchParams, setSearchParams]);

  const withBusy = async (id: string, fn: () => Promise<void>) => {
    setBusy(s => new Set(s).add(id));
    try { await fn(); } catch (e) { setError(e instanceof Error ? e.message : 'Actie mislukt'); }
    finally { setBusy(s => { const n = new Set(s); n.delete(id); return n; }); }
  };

  const toggle = (s: CronSchedule) => withBusy(s.id, async () => {
    await cronUpdateSchedule(s.id, { enabled: !s.enabled });
    await load();
  });

  const runNow = (s: CronSchedule) => withBusy(s.id, async () => {
    const { result } = await cronRunNow(s.id);
    /* De uitkomst als melding en niet in de rij.
     *
     * Bij de kaarten stond hij onderin de kaart. In een tabel kan dat niet
     * zonder de rij te laten groeien, en een rij die van hoogte verandert
     * schuift alles eronder weg terwijl je kijkt. Weggooien mag ook niet: dan
     * druk je op Nu en gebeurt er zichtbaar niets. Dus een melding, met de
     * naam erbij zodat je bij vijf tabellen weet welke job het was. */
    const kort = result.output.slice(0, 300);
    if (result.status === 'ok') toast.success(`${s.name} — gelukt`, { description: kort });
    else toast.error(`${s.name} — mislukt`, { description: kort });
    await load();
  });

  const remove = (s: CronSchedule) => withBusy(s.id, async () => {
    await cronDeleteSchedule(s.id);
    await load();
  });

  const create = async () => {
    if (!draft.name.trim() || !draft.cron_expr.trim()) return;
    setBusy(s => new Set(s).add('__new__'));
    try {
      await cronCreateSchedule({
        name: draft.name.trim(),
        cron_expr: draft.cron_expr.trim(),
        timezone: 'Europe/Amsterdam',
        action_type: draft.action_type,
        action_payload: draftToPayload(draft),
        enabled: true,
        metadata: { app: activeApp },
      });
      setDraft(draftForApp(activeApp));
      setAdding(false);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not create');
    } finally {
      setBusy(s => { const n = new Set(s); n.delete('__new__'); return n; });
    }
  };

  const voorApp = (app: AppId) => schedules.filter(s => scheduleApp(s) === app);
  const activeCount = schedules.filter(s => s.enabled).length;

  const openNew = () => { setDraft(draftForApp(activeApp)); setAdding(true); };
  /* De + op een tabelkop opent het formulier VOOR die app. Zonder dit moest je
     eerst een tab kiezen en dan pas Nieuw -- en die tabs zijn er niet meer. */
  const openNewVoor = (app: AppId) => { setActiveApp(app); setDraft(draftForApp(app)); setAdding(true); };

  /* Eén set handelingen voor alle vijf de tabellen. Het waren kaarten die elk
     hun eigen drie knoppen meebrachten; vijf tabellen die elk hun eigen versie
     krijgen zouden vijf plekken zijn waar het uit elkaar kan lopen. */
  const tabelActies: TabelActies = {
    runNow: s => { void runNow(s); },
    toggle: s => { void toggle(s); },
    remove: s => { void remove(s); },
    bezig: id => busy.has(id),
  };
  const kolomTekst: KolomTekst = {
    soort: s => `${(ACTION_META[s.action_type] ?? ACTION_META.exec).label}${s.executor === 'mac' ? ' · Mac' : ''}`,
    soortKleur: s => (ACTION_META[s.action_type] ?? ACTION_META.exec).color,
    menselijk: cronToHuman,
    tijd: fmt,
  };

  return (
    /* Flexkolom: kop en app-tabs vast, de schema's krijgen de rest van de
       hoogte. Eerst schoof de hele pagina en stond alles bovenin. */
    <motion.div
      className="axe-tabruimte flex min-h-0 flex-1 flex-col pt-4 sm:pt-6"
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.3 }}
    >
      {/* Header */}
      <div className="flex flex-none items-center justify-between mb-4 gap-2">
      {/* De titel is weg -- de nav zegt al waar je bent -- maar de cijfers die
          eronder stonden niet: die zijn de stand van deze tab en horen in de
          topbalk, waar ze zichtbaar blijven zonder een regel te kosten. */}
      <TopbalkSlot>
        <span className="text-[10px] font-mono-data" style={{ color: 'var(--text-secondary)' }}>
          {loading ? 'Laden…' : `${activeCount} actief · ${schedules.length} schema’s`}
        </span>
      </TopbalkSlot>
      {/* Titel en omschrijving weg: de nav onderin zegt al waar je bent, en
          twee regels die dat herhalen kosten op elke pagina ruimte. */}
        <div className="flex items-center gap-2 shrink-0">
          <button onClick={openNew}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium"
            style={{ background: 'var(--accent-cyan)', color: '#000' }}>
            <Plus size={14} /> Nieuw
          </button>
          <button onClick={load} disabled={loading}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm"
            style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)', color: 'var(--text-secondary)' }}>
            <RefreshCw size={13} className={loading ? 'animate-spin' : ''} /> Refresh
          </button>
        </div>
      </div>

      {/* De enige schuif: foutmelding, het nieuwe-schema-formulier en de lijst
          samen. De app-tabs erboven blijven staan. */}
      <div className="min-h-0 flex-1 overflow-y-auto">
      {error && (
        <div className="mb-4 px-4 py-3 rounded-xl flex items-center gap-2 text-sm" style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.2)', color: 'var(--error)' }}>
          <AlertCircle size={14} /> {error}
          <button onClick={() => setError(null)} className="ml-auto text-xs opacity-60 hover:opacity-100"><X size={12} /></button>
        </div>
      )}

      {/* New-schedule form */}
      <AnimatePresence>
        {adding && (
          <motion.div
            initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }}
            className="mb-5 overflow-hidden"
          >
            <div className="rounded-xl p-4 space-y-3" style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-active)' }}>
              <input
                value={draft.name} onChange={e => setDraft(d => ({ ...d, name: e.target.value }))}
                placeholder="Naam (bijv. 'Ochtend-briefing')"
                className="w-full text-small px-3 py-2 rounded-lg outline-none"
                style={{ background: 'var(--bg-base)', border: '1px solid var(--border-active)', color: 'var(--text-primary)', fontSize: 16 }}
              />

              {/* Cron expression + presets */}
              <div className="space-y-1.5">
                <div className="flex flex-wrap gap-1">
                  {CRON_PRESETS.map(p => (
                    <button key={p.label} onClick={() => setDraft(d => ({ ...d, cron_expr: p.expr }))}
                      className="text-[10px] px-2 py-1 rounded-full"
                      style={{ background: draft.cron_expr === p.expr ? 'var(--tint-line)' : 'rgba(255,255,255,0.04)', border: `1px solid ${draft.cron_expr === p.expr ? 'var(--tint-line)' : 'rgba(255,255,255,0.08)'}`, color: draft.cron_expr === p.expr ? 'var(--accent-cyan)' : 'var(--text-muted)' }}>
                      {p.label}
                    </button>
                  ))}
                </div>
                <input
                  value={draft.cron_expr} onChange={e => setDraft(d => ({ ...d, cron_expr: e.target.value }))}
                  placeholder="min uur dag maand weekdag (bijv. 0 8 * * *)"
                  className="w-full text-xs-custom font-mono px-3 py-2 rounded-lg outline-none"
                  style={{ background: 'var(--bg-base)', border: '1px solid rgba(255,255,255,0.05)', color: 'var(--text-primary)', fontSize: 16 }}
                />
                <p className="text-[10px]" style={{ color: 'var(--text-muted)' }}>→ {cronToHuman(draft.cron_expr)} (Europe/Amsterdam)</p>
              </div>

              {/* Action type */}
              <div className="flex flex-wrap gap-1.5">
                {(Object.keys(ACTION_META) as CronActionType[]).filter(t => !['observed', 'planner', 'northsea'].includes(t)).map(t => {
                  const M = ACTION_META[t]; const Icon = M.icon; const sel = draft.action_type === t;
                  return (
                    <button key={t} onClick={() => setDraft(d => ({ ...d, action_type: t }))}
                      className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[11px] font-medium"
                      style={{ background: sel ? `${M.color}1a` : 'rgba(255,255,255,0.03)', border: `1px solid ${sel ? `${M.color}55` : 'rgba(255,255,255,0.07)'}`, color: sel ? M.color : 'var(--text-muted)' }}>
                      <Icon size={12} /> {M.label}
                    </button>
                  );
                })}
              </div>

              {/* Per-action payload fields */}
              {(draft.action_type === 'prompt' || draft.action_type === 'crew') && (
                <textarea
                  value={draft.prompt} onChange={e => setDraft(d => ({ ...d, prompt: e.target.value }))}
                  placeholder={draft.action_type === 'prompt' ? 'What should AXE do? (e.g. "Summarise last night\u2019s OSINT")' : 'Crew task (e.g. "Research competitor X and write a report")'}
                  rows={3}
                  className="w-full text-xs-custom px-3 py-2 rounded-lg outline-none resize-y"
                  style={{ background: 'var(--bg-base)', border: '1px solid rgba(255,255,255,0.05)', color: 'var(--text-primary)', fontSize: 16 }}
                />
              )}
              {draft.action_type === 'exec' && (
                <input
                  value={draft.command} onChange={e => setDraft(d => ({ ...d, command: e.target.value }))}
                  placeholder="Shell-commando (bijv. bash /opt/backup.sh)"
                  className="w-full text-xs-custom font-mono px-3 py-2 rounded-lg outline-none"
                  style={{ background: 'var(--bg-base)', border: '1px solid rgba(255,255,255,0.05)', color: 'var(--text-primary)', fontSize: 16 }}
                />
              )}
              {draft.action_type === 'flow' && (
                <div className="space-y-2">
                  <input
                    value={draft.flowName} onChange={e => setDraft(d => ({ ...d, flowName: e.target.value }))}
                    placeholder="Flow (bijv. trading_intelligence)"
                    className="w-full text-xs-custom font-mono px-3 py-2 rounded-lg outline-none"
                    style={{ background: 'var(--bg-base)', border: '1px solid rgba(255,255,255,0.05)', color: 'var(--text-primary)', fontSize: 16 }}
                  />
                  <div className="flex gap-2">
                    <input
                      value={draft.flowAsset} onChange={e => setDraft(d => ({ ...d, flowAsset: e.target.value.toUpperCase() }))}
                      placeholder="Asset (XAUUSD)"
                      className="flex-1 text-xs-custom font-mono px-3 py-2 rounded-lg outline-none"
                      style={{ background: 'var(--bg-base)', border: '1px solid rgba(255,255,255,0.05)', color: 'var(--text-primary)', fontSize: 16 }}
                    />
                    <select value={draft.flowDepth} onChange={e => setDraft(d => ({ ...d, flowDepth: e.target.value }))}
                      className="text-xs-custom px-2 py-2 rounded-lg outline-none"
                      style={{ background: 'var(--bg-base)', border: '1px solid rgba(255,255,255,0.05)', color: 'var(--text-primary)' }}>
                      {['quick_scan', 'standard', 'full_institutional'].map(m => <option key={m} value={m}>{m}</option>)}
                    </select>
                  </div>
                  <input
                    value={draft.flowTopic} onChange={e => setDraft(d => ({ ...d, flowTopic: e.target.value }))}
                    placeholder="Topic (bijv. daily research cycle)"
                    className="w-full text-xs-custom px-3 py-2 rounded-lg outline-none"
                    style={{ background: 'var(--bg-base)', border: '1px solid rgba(255,255,255,0.05)', color: 'var(--text-primary)', fontSize: 16 }}
                  />
                  <p className="text-[10px]" style={{ color: 'var(--text-muted)' }}>
                    Een volledige institutionele research-cyclus kan lang duren (meerdere agent-stappen na elkaar) — plan dit niet vaker dan een paar keer per dag.
                  </p>
                </div>
              )}
              {draft.action_type === 'webhook' && (
                <div className="space-y-2">
                  <div className="flex gap-2">
                    <select value={draft.method} onChange={e => setDraft(d => ({ ...d, method: e.target.value }))}
                      className="text-xs-custom px-2 py-2 rounded-lg outline-none"
                      style={{ background: 'var(--bg-base)', border: '1px solid rgba(255,255,255,0.05)', color: 'var(--text-primary)' }}>
                      {['POST', 'GET', 'PUT'].map(m => <option key={m} value={m}>{m}</option>)}
                    </select>
                    <input value={draft.url} onChange={e => setDraft(d => ({ ...d, url: e.target.value }))}
                      placeholder="https://your-app.com/webhook"
                      className="flex-1 text-xs-custom px-3 py-2 rounded-lg outline-none"
                      style={{ background: 'var(--bg-base)', border: '1px solid rgba(255,255,255,0.05)', color: 'var(--text-primary)', fontSize: 16 }} />
                  </div>
                  <input value={draft.bodyJson} onChange={e => setDraft(d => ({ ...d, bodyJson: e.target.value }))}
                    placeholder='JSON body (optioneel, bijv. {"key":"value"})'
                    className="w-full text-xs-custom font-mono px-3 py-2 rounded-lg outline-none"
                    style={{ background: 'var(--bg-base)', border: '1px solid rgba(255,255,255,0.05)', color: 'var(--text-primary)', fontSize: 16 }} />
                  <label className="flex items-center gap-2 text-[11px]" style={{ color: 'var(--text-muted)' }}>
                    <input type="checkbox" checked={draft.includeCronKey} onChange={e => setDraft(d => ({ ...d, includeCronKey: e.target.checked }))} />
                    Stuur mijn CRON_SECRET mee als Bearer-token (voor AXE Companion / Trading OS)
                  </label>
                </div>
              )}

              <div className="flex justify-end gap-2 pt-1">
                <button onClick={() => { setAdding(false); setDraft(EMPTY_DRAFT); }}
                  className="px-3 py-1.5 rounded-lg text-xs-custom" style={{ background: 'var(--bg-base)', border: '1px solid var(--border-subtle)', color: 'var(--text-muted)' }}>
                  Annuleren
                </button>
                <button onClick={() => { void create(); }} disabled={busy.has('__new__') || !draft.name.trim()}
                  className="px-4 py-1.5 rounded-lg text-xs-custom font-medium disabled:opacity-50" style={{ background: 'var(--accent-cyan)', color: '#000' }}>
                  {busy.has('__new__') ? 'Working…' : 'Create'}
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* List */}
      {loading ? (
        <div className={LIST_GRID}>
          {[...Array(3)].map((_, i) => <div key={i} className="h-36 rounded-xl animate-pulse" style={{ background: 'var(--bg-surface)' }} />)}
        </div>
      ) : (
        /* AXE Core over de VOLLE breedte, de vier anderen eronder naast
           elkaar. Zie de uitleg bij APP_TABS: dat is geen smaak maar het
           verschil tussen lokaal draaien en een webhook. */
        <div className="axe-cronvel">
          <CronTabel
            titel={appInfo('axe_core').label}
            onderschrift={appInfo('axe_core').blurb}
            kleur={appInfo('axe_core').kleur}
            schemas={voorApp('axe_core')}
            acties={tabelActies}
            tekst={kolomTekst}
            opNieuw={() => openNewVoor('axe_core')}
          />

          <div className="axe-cronvier">
            {NAAST_ELKAAR.map(id => (
              <CronTabel
                key={id}
                titel={appInfo(id).label}
                onderschrift={appInfo(id).blurb}
                kleur={appInfo(id).kleur}
                schemas={voorApp(id)}
                acties={tabelActies}
                tekst={kolomTekst}
                compact
                opNieuw={() => openNewVoor(id)}
              />
            ))}
          </div>
        </div>
      )}
      </div>
    </motion.div>
  );
}
