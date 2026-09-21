/**
 * Wat de drie hoofdagents zelf gepland hebben (backend/axe_api/planner.py).
 *
 * Leestaken doet de planner zelf; die staan hier met hun uitkomst. Schrijftaken
 * wachten op jou: Goedkeuren laat de Code Agent ze in de volgende ronde
 * uitvoeren (ongecommit, jij bekijkt de diff), Afwijzen legt ze weg.
 */
import { useCallback, useEffect, useState } from 'react';
import { Check, RefreshCw, Sparkles, X } from 'lucide-react';
import { toast } from 'sonner';
import { WidgetCard } from '@/presentation/components/widgets/WidgetCard';
import {
  plannerBesluit, plannerRonde, plannerStatus, plannerTaken,
  type PlannerStatus, type PlannerTaak,
} from '@/infrastructure/gateways/axeCoreApiService';

const AGENT: Record<string, string> = {
  'axe-core': 'AXE Core',
  'code-agent': 'Code Agent',
  'axe-algo': 'AXE Algo',
  'maps-agent': 'NorthSea Desk',
};

const PLANNER_INPUT: Record<string, string> = {
  'axe-core': 'recent memory + RAG + open planner tasks',
  'code-agent': 'recent memory + RAG + Git status + last 5 commits + open planner tasks',
  'axe-algo': 'trading/research memory + RAG + open planner tasks',
  'maps-agent': 'NorthSea/shared memory + RAG + open planner tasks',
};

function intervalLabel(seconds?: number): string {
  if (!seconds) return 'onbekende cadans';
  if (seconds % 3600 === 0) return `elke ${seconds / 3600} uur`;
  if (seconds % 60 === 0) return `elke ${seconds / 60} min`;
  return `elke ${seconds}s`;
}

function datumTijd(iso?: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString([], { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
}

function stand(t: PlannerTaak): { tekst: string; kleur: string } {
  const g = t.metadata?.goedkeuring;
  if (t.status === 'completed') return { tekst: 'klaar', kleur: 'var(--success)' };
  if (t.status === 'running') return { tekst: 'bezig', kleur: 'var(--accent-cyan)' };
  if (t.status === 'failed') return { tekst: 'mislukt', kleur: 'var(--error)' };
  if (t.status === 'cancelled') return { tekst: 'afgewezen', kleur: 'var(--text-muted)' };
  if (g === 'nodig') return { tekst: 'wacht op jou', kleur: 'var(--warning)' };
  if (g === 'ja') return { tekst: 'goedgekeurd', kleur: 'var(--success)' };
  return { tekst: 'gepland', kleur: 'var(--text-secondary)' };
}

export function PlannerTaken() {
  const [taken, setTaken] = useState<PlannerTaak[] | null>(null);
  const [status, setStatus] = useState<PlannerStatus | null>(null);
  const [fout, setFout] = useState<string | null>(null);
  const [open, setOpen] = useState<string | null>(null);

  const laad = useCallback(async () => {
    try {
      const [t, s] = await Promise.all([plannerTaken(30), plannerStatus()]);
      setTaken(t.taken); setStatus(s); setFout(null);
    } catch (e) {
      setFout(e instanceof Error ? e.message : String(e));
    }
  }, []);

  useEffect(() => {
    void laad();
    const id = setInterval(() => { if (!document.hidden) void laad(); }, 30_000);
    return () => clearInterval(id);
  }, [laad]);

  const besluit = async (t: PlannerTaak, goed: boolean) => {
    try {
      await plannerBesluit(t.id, goed);
      toast.success(goed ? 'Goedgekeurd — de volgende ronde voert hem uit' : 'Afgewezen');
      void laad();
    } catch (e) { toast.error(e instanceof Error ? e.message : String(e)); }
  };

  const nuPlannen = async () => {
    try {
      const r = await plannerRonde();
      toast.success(r.gestart ? 'Ronde gestart — dit duurt een paar minuten' : (r.reden ?? 'Niet gestart'));
      setTimeout(() => { void laad(); }, 4000);
    } catch (e) { toast.error(e instanceof Error ? e.message : String(e)); }
  };

  const wacht = (taken ?? []).filter(t => t.metadata?.goedkeuring === 'nodig' && t.status === 'pending').length;
  const laatste = status?.laatste_ronde?.klaar ? new Date(status.laatste_ronde.klaar) : null;

  return (
    <div data-axe-doel="planner" className="mb-4 flex-none">
      <WidgetCard
        title={`Planner${wacht ? ` · ${wacht} wacht op jou` : ''}`}
        icon={<Sparkles size={14} />}
        headerAction={
          <div className="flex items-center gap-2">
            <span className="text-[10px]" style={{ color: 'var(--text-muted)' }}>
              {status?.bezig ? 'ronde loopt…' : laatste ? `laatste ronde ${laatste.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}` : status?.host_kan ? 'nog geen ronde' : 'staat uit op deze host'}
            </span>
            <button type="button" onClick={() => { void nuPlannen(); }} disabled={!status?.host_kan || status?.bezig}
              className="inline-flex items-center gap-1 text-[11px] px-2 py-1 rounded-md"
              style={{ color: 'var(--accent-cyan)', border: '1px solid var(--tint-line)', opacity: !status?.host_kan || status?.bezig ? 0.5 : 1 }}>
              <RefreshCw size={11} /> Nu plannen
            </button>
          </div>
        }
      >
        {fout && <div className="text-[11px]" style={{ color: 'var(--error)' }}>Planner niet bereikbaar: {fout}</div>}
        {!fout && (
          <div
            className="mb-3 rounded-lg px-3 py-2.5"
            style={{ background: 'var(--tint)', border: '1px solid var(--tint-line)' }}
          >
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px]" style={{ color: 'var(--text-muted)' }}>
              <span style={{ color: 'var(--accent-cyan)' }}>AUTONOME PLANNER</span>
              <span>{intervalLabel(status?.interval_s)}</span>
              <span>max 3 voorstellen per agent</span>
              <span>lezen = mag direct</span>
              <span>schrijven = eerst jouw akkoord</span>
            </div>
            <div className="mt-2 grid gap-1.5 md:grid-cols-2 xl:grid-cols-4">
              {Object.entries(status?.laatste_ronde?.agents ?? {}).map(([agentId, a]) => (
                <div key={agentId} className="rounded-md px-2 py-1.5" style={{ background: 'var(--surface-bg)', border: '1px solid var(--border-subtle)' }}>
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] font-medium" style={{ color: 'var(--text-primary)' }}>{AGENT[agentId] ?? agentId}</span>
                    <span className="ml-auto text-[9px] font-mono" style={{ color: 'var(--text-muted)' }}>
                      plan {a.plan_motor ?? '—'} · run {a.motor}
                    </span>
                  </div>
                  <div className="mt-1 text-[10px]" style={{ color: 'var(--text-secondary)' }}>
                    {a.voorstellen?.length
                      ? `${a.voorstellen.length} voorstel${a.voorstellen.length === 1 ? '' : 'len'}: ${a.voorstellen.join(' · ')}`
                      : a.fout ? `geen voorstel · ${a.fout}` : 'geen nieuw voorstel'}
                  </div>
                  {a.plan_terugval && (
                    <div className="mt-1 text-[9px]" style={{ color: 'var(--warning)' }}>
                      fallback {a.plan_terugval.van} → {a.plan_terugval.naar}: {a.plan_terugval.reden}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
        {!fout && taken?.length === 0 && (
          <div className="text-[11px]" style={{ color: 'var(--text-muted)' }}>
            Nog niets gepland. De planner leest recente context en open taken, en plant alleen als er aantoonbaar iets nuttigs ligt.
          </div>
        )}
        <div className="flex flex-col gap-1.5 max-h-[440px] overflow-y-auto">
          {(taken ?? []).map(t => {
            const s = stand(t);
            const uitkomst = t.result?.output ?? t.error?.message ?? null;
            const agentId = t.metadata?.agent ?? t.assignee ?? 'axe-core';
            const schrijft = t.metadata?.risico === 'schrijven';
            return (
              <div key={t.id} className="rounded-lg px-3 py-2" style={{ background: 'var(--surface-bg)', border: '1px solid var(--border-subtle)' }}>
                <div className="flex items-center gap-2">
                  <span className="text-[10px] uppercase tracking-wide shrink-0" style={{ color: 'var(--text-muted)' }}>
                    {AGENT[agentId] ?? agentId}
                  </span>
                  <span className="text-[9px] shrink-0" style={{ color: schrijft ? 'var(--warning)' : 'var(--accent-cyan)' }}>
                    {schrijft ? 'SCHRIJFT' : 'LEEST'}
                  </span>
                  <span className="text-[9px] shrink-0 font-mono" style={{ color: 'var(--text-muted)' }}>
                    {t.metadata?.motor ?? 'motor ?'} · {t.priority}
                  </span>
                  <button type="button" onClick={() => setOpen(o => (o === t.id ? null : t.id))}
                    className="text-left text-[12px] font-medium truncate flex-1 min-w-0" style={{ color: 'var(--text-primary)' }}>
                    {t.title}
                  </button>
                  <span className="text-[9px] shrink-0 font-mono" style={{ color: 'var(--text-muted)' }}>
                    {datumTijd(t.created_at)}
                  </span>
                  <span className="text-[10px] shrink-0" style={{ color: s.kleur }}>{s.tekst}</span>
                  {t.metadata?.goedkeuring === 'nodig' && t.status === 'pending' && (
                    <>
                      <button type="button" title="Goedkeuren" onClick={() => { void besluit(t, true); }} style={{ color: 'var(--success)' }}><Check size={14} /></button>
                      <button type="button" title="Afwijzen" onClick={() => { void besluit(t, false); }} style={{ color: 'var(--text-muted)' }}><X size={14} /></button>
                    </>
                  )}
                </div>
                {open === t.id && (
                  <div className="mt-2 grid gap-2 text-[11px] md:grid-cols-2" style={{ color: 'var(--text-secondary)' }}>
                    <div className="rounded-md p-2" style={{ background: 'var(--bg-base)', border: '1px solid var(--border-subtle)' }}>
                      <div className="text-[9px] uppercase tracking-wide mb-1" style={{ color: 'var(--text-muted)' }}>Doel</div>
                      <div className="whitespace-pre-wrap">{t.goal || 'Geen doeltekst opgeslagen.'}</div>
                    </div>
                    <div className="rounded-md p-2" style={{ background: 'var(--bg-base)', border: '1px solid var(--border-subtle)' }}>
                      <div className="text-[9px] uppercase tracking-wide mb-1" style={{ color: 'var(--text-muted)' }}>Waarom gepland</div>
                      <div className="whitespace-pre-wrap">{t.description || 'Het model gaf geen aparte waarom-regel terug.'}</div>
                    </div>
                    <div className="rounded-md p-2" style={{ background: 'var(--bg-base)', border: '1px solid var(--border-subtle)' }}>
                      <div className="text-[9px] uppercase tracking-wide mb-1" style={{ color: 'var(--text-muted)' }}>Waar kwam dit vandaan?</div>
                      <div>{PLANNER_INPUT[agentId] ?? 'recent memory + RAG + open planner tasks'}</div>
                      <div className="mt-1 text-[9px]" style={{ color: 'var(--text-muted)' }}>
                        De planner vraagt per ronde om maximaal 3 concrete taken en geeft bestaande open taken mee om dubbelen te voorkomen.
                      </div>
                    </div>
                    <div className="rounded-md p-2" style={{ background: 'var(--bg-base)', border: '1px solid var(--border-subtle)' }}>
                      <div className="text-[9px] uppercase tracking-wide mb-1" style={{ color: 'var(--text-muted)' }}>Uitvoering</div>
                      <div>motor: {t.metadata?.motor ?? 'onbekend'} · risico: {schrijft ? 'schrijven' : 'lezen'} · akkoord: {t.metadata?.goedkeuring ?? 'onbekend'}</div>
                      <div className="mt-1">pogingen: {t.metadata?.pogingen ?? 0} · app: {t.metadata?.app ?? 'axe_core'}</div>
                      <div className="mt-1 text-[9px]" style={{ color: 'var(--text-muted)' }}>
                        aangemaakt {datumTijd(t.created_at)} · afgerond {datumTijd(t.completed_at)}
                      </div>
                    </div>
                    {uitkomst && (
                      <div className="md:col-span-2 rounded-md p-2 whitespace-pre-wrap" style={{ background: 'var(--bg-base)', border: '1px solid var(--border-subtle)' }}>
                        <div className="text-[9px] uppercase tracking-wide mb-1" style={{ color: t.error?.message ? 'var(--error)' : 'var(--success)' }}>
                          {t.error?.message ? 'Fout / blokkade' : 'Uitkomst'}
                        </div>
                        {uitkomst}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </WidgetCard>
    </div>
  );
}
