import { useEffect, useState, useRef, useCallback } from 'react';
import { useSearchParams } from 'react-router';
import { motion, AnimatePresence } from 'framer-motion';
import { LIST_GRID } from '@/presentation/components/surface/Page';
import {
  Calendar, Play, Trash2, RefreshCw, Plus, Clock, AlertCircle, CheckCircle,
  XCircle, Terminal, Globe, Bot, MessageSquare, Power, Workflow,
} from 'lucide-react';
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
};

/* ── App tabs ─────────────────────────────────────────────────────────────
 * Each schedule is tagged with metadata.app so cron jobs for AXE Core, AXE
 * Companion and Trading OS stay cleanly separated. AXE Core runs its jobs
 * locally (prompt/crew/exec); the two external apps are driven via a webhook
 * carrying your CRON_KEY — the self-hosted pattern you already use. */
type AppId = 'axe_core' | 'axe_companion' | 'trading_os';
const APP_TABS: Array<{ id: AppId; label: string; color: string; blurb: string }> = [
  { id: 'axe_core',      label: 'AXE Core',      color: 'var(--accent-cyan)', blurb: 'Prompts, CrewAI-runs en VPS-commando’s op je eigen server.' },
  { id: 'axe_companion', label: 'AXE Companion', color: '#a78bfa', blurb: 'Webhook-jobs naar AXE Companion, met je CRON_KEY.' },
  { id: 'trading_os',    label: 'Trading OS',    color: 'var(--success)', blurb: 'Webhook-jobs naar Trading OS, met je CRON_KEY.' },
];

function scheduleApp(s: CronSchedule): AppId {
  const a = (s.metadata?.app as string) ?? 'axe_core';
  return (['axe_core', 'axe_companion', 'trading_os'].includes(a) ? a : 'axe_core') as AppId;
}

/** A fresh draft seeded for the given app: external apps default to a
 *  cron-key webhook, AXE Core to a prompt. */
function draftForApp(app: AppId): Draft {
  if (app === 'axe_core') return { ...EMPTY_DRAFT };
  return { ...EMPTY_DRAFT, action_type: 'webhook', method: 'POST', includeCronKey: true };
}

function fmt(dt: string | null): string {
  if (!dt) return '—';
  return new Date(dt).toLocaleString('nl-NL', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
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
  const [runResult, setRunResult] = useState<Record<string, string>>({});

  const [searchParams, setSearchParams] = useSearchParams();
  const openId = searchParams.get('open');
  const cardRefs = useRef<Record<string, HTMLDivElement | null>>({});

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setSchedules(await cronListSchedules());
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Kon schedules niet laden');
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
    setRunResult(r => ({ ...r, [s.id]: `${result.status.toUpperCase()} · ${result.output.slice(0, 300)}` }));
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
      setError(e instanceof Error ? e.message : 'Aanmaken mislukt');
    } finally {
      setBusy(s => { const n = new Set(s); n.delete('__new__'); return n; });
    }
  };

  const visible = schedules.filter(s => scheduleApp(s) === activeApp);
  const activeCount = visible.filter(s => s.enabled).length;
  const countFor = (app: AppId) => schedules.filter(s => scheduleApp(s) === app).length;
  const openNew = () => { setDraft(draftForApp(activeApp)); setAdding(true); };
  const switchApp = (app: AppId) => { setActiveApp(app); if (adding) setDraft(draftForApp(app)); };

  return (
    <motion.div
      className="p-4 sm:p-6 h-full overflow-y-auto"
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.3 }}
    >
      {/* Header */}
      <div className="flex items-center justify-between mb-4 gap-2">
        <div className="min-w-0">
          <h1 className="text-page-title font-semibold mb-1" style={{ color: 'var(--text-primary)' }}>Cron Manager</h1>
          <p className="text-body" style={{ color: 'var(--text-secondary)' }}>
            {loading ? 'Laden…' : `${activeCount} actief · ${visible.length} in ${APP_TABS.find(t => t.id === activeApp)?.label} · self-hosted`}
          </p>
        </div>
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

      {/* App tabs — separate cron jobs per app */}
      <div className="flex items-center gap-1.5 mb-4 overflow-x-auto scrollbar-none pb-0.5">
        {APP_TABS.map(t => {
          const sel = t.id === activeApp;
          return (
            <button key={t.id} onClick={() => switchApp(t.id)}
              className="flex items-center gap-2 px-3.5 py-2 rounded-xl text-sm font-medium shrink-0 transition-all"
              style={{
                background: sel ? `${t.color}1a` : 'rgba(255,255,255,0.03)',
                border: `1px solid ${sel ? `${t.color}66` : 'rgba(255,255,255,0.07)'}`,
                color: sel ? t.color : 'var(--text-muted)',
              }}>
              <span className="rounded-full" style={{ width: 7, height: 7, background: t.color, display: 'inline-block', opacity: sel ? 1 : 0.4 }} />
              {t.label}
              <span className="text-[10px] px-1.5 py-0.5 rounded-full" style={{ background: sel ? `${t.color}22` : 'rgba(255,255,255,0.05)', color: sel ? t.color : 'var(--text-muted)' }}>{countFor(t.id)}</span>
            </button>
          );
        })}
      </div>
      <p className="text-[11px] mb-4 -mt-1" style={{ color: 'var(--text-muted)' }}>
        {APP_TABS.find(t => t.id === activeApp)?.blurb}
      </p>

      {error && (
        <div className="mb-4 px-4 py-3 rounded-xl flex items-center gap-2 text-sm" style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.2)', color: 'var(--error)' }}>
          <AlertCircle size={14} /> {error}
          <button onClick={() => setError(null)} className="ml-auto text-xs opacity-60 hover:opacity-100">✕</button>
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
                {(Object.keys(ACTION_META) as CronActionType[]).map(t => {
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
                  placeholder={draft.action_type === 'prompt' ? 'Wat moet AXE doen? (bijv. "Vat de OSINT van vannacht samen")' : 'Crew-taak (bijv. "Onderzoek concurrentie X en schrijf een rapport")'}
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
                      placeholder="https://jouw-app.com/webhook"
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
                  {busy.has('__new__') ? 'Bezig…' : 'Aanmaken'}
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
      ) : visible.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 gap-3" style={{ color: 'var(--text-muted)' }}>
          <Calendar size={28} />
          <span className="text-sm">Nog geen schedules voor {APP_TABS.find(t => t.id === activeApp)?.label} — maak er één met "Nieuw"</span>
        </div>
      ) : (
        <div className={LIST_GRID}>
          {visible.map((s, i) => {
            const M = ACTION_META[s.action_type]; const Icon = M.icon;
            const isBusy = busy.has(s.id);
            return (
              <motion.div key={s.id} ref={el => { cardRefs.current[s.id] = el; }}
                initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.03 }}
                className="rounded-xl p-4 flex flex-col gap-2.5"
                style={{ background: 'var(--bg-surface)', border: `1px solid ${s.enabled ? `${M.color}30` : 'var(--border-subtle)'}`, opacity: s.enabled ? 1 : 0.6 }}>
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <Icon size={14} style={{ color: M.color, flexShrink: 0 }} />
                    <span className="text-small font-medium truncate" style={{ color: 'var(--text-primary)' }}>{s.name}</span>
                  </div>
                  <span className="text-[9px] px-1.5 py-0.5 rounded shrink-0" style={{ background: `${M.color}1a`, color: M.color, border: `1px solid ${M.color}30` }}>{M.label}</span>
                </div>

                <div className="flex items-center gap-1.5 text-[11px]" style={{ color: 'var(--text-secondary)' }}>
                  <Clock size={11} style={{ color: 'var(--text-muted)' }} />
                  <span className="font-mono">{s.cron_expr}</span>
                  <span style={{ color: 'var(--text-muted)' }}>· {cronToHuman(s.cron_expr)}</span>
                </div>

                <div className="flex items-center gap-3 text-[10px]" style={{ color: 'var(--text-muted)' }}>
                  <span>Volgende: {s.enabled ? fmt(s.next_run_at) : 'uit'}</span>
                  {s.last_status && (
                    <span className="flex items-center gap-1" style={{ color: s.last_status === 'ok' ? 'var(--success)' : 'var(--error)' }}>
                      {s.last_status === 'ok' ? <CheckCircle size={10} /> : <XCircle size={10} />}
                      {fmt(s.last_run_at)}
                    </span>
                  )}
                </div>

                {(runResult[s.id] || s.last_result) && (
                  <div className="text-[10px] font-mono px-2 py-1.5 rounded max-h-20 overflow-y-auto whitespace-pre-wrap"
                    style={{ background: 'var(--bg-base)', color: 'var(--text-secondary)', border: '1px solid rgba(255,255,255,0.04)' }}>
                    {runResult[s.id] ?? s.last_result}
                  </div>
                )}

                <div className="flex items-center gap-1.5 pt-1 mt-auto">
                  <button onClick={() => { void toggle(s); }} disabled={isBusy}
                    className="flex items-center gap-1 px-2 py-1 rounded text-[10px]"
                    style={{ background: s.enabled ? 'rgba(52,211,153,0.1)' : 'rgba(255,255,255,0.04)', color: s.enabled ? 'var(--success)' : 'var(--text-muted)', border: `1px solid ${s.enabled ? 'rgba(52,211,153,0.25)' : 'rgba(255,255,255,0.08)'}` }}>
                    <Power size={10} /> {s.enabled ? 'Aan' : 'Uit'}
                  </button>
                  <button onClick={() => { void runNow(s); }} disabled={isBusy}
                    className="flex items-center gap-1 px-2 py-1 rounded text-[10px]"
                    style={{ background: 'var(--tint-line)', color: 'var(--accent-cyan)', border: '1px solid var(--tint-line)' }}>
                    {isBusy ? <RefreshCw size={10} className="animate-spin" /> : <Play size={10} />} Nu uitvoeren
                  </button>
                  <button onClick={() => { void remove(s); }} disabled={isBusy}
                    className="ml-auto p-1 rounded" style={{ color: 'var(--text-muted)' }} title="Verwijderen">
                    <Trash2 size={12} />
                  </button>
                </div>
              </motion.div>
            );
          })}
        </div>
      )}
    </motion.div>
  );
}
