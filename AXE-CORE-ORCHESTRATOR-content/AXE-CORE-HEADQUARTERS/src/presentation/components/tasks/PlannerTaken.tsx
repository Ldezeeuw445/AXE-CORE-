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

const AGENT: Record<string, string> = { 'axe-core': 'AXE Core', 'code-agent': 'Code Agent', 'axe-algo': 'AXE Algo' };

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
        {!fout && taken?.length === 0 && (
          <div className="text-[11px]" style={{ color: 'var(--text-muted)' }}>
            Nog niets gepland. Elke drie uur bedenken AXE Core, de Code Agent en AXE Algo zelf wat er moet gebeuren.
          </div>
        )}
        <div className="flex flex-col gap-1.5 max-h-[320px] overflow-y-auto">
          {(taken ?? []).map(t => {
            const s = stand(t);
            const uitkomst = t.result?.output ?? t.error?.message ?? null;
            return (
              <div key={t.id} className="rounded-lg px-3 py-2" style={{ background: 'var(--bg-base)', border: '1px solid var(--border-subtle)' }}>
                <div className="flex items-center gap-2">
                  <span className="text-[10px] uppercase tracking-wide shrink-0" style={{ color: 'var(--text-muted)' }}>
                    {AGENT[t.metadata?.agent ?? t.assignee ?? ''] ?? 'AXE'} · {t.metadata?.risico === 'schrijven' ? 'schrijft' : 'leest'}
                  </span>
                  <button type="button" onClick={() => setOpen(o => (o === t.id ? null : t.id))}
                    className="text-left text-[12px] font-medium truncate flex-1 min-w-0" style={{ color: 'var(--text-primary)' }}>
                    {t.title}
                  </button>
                  <span className="text-[10px] shrink-0" style={{ color: s.kleur }}>{s.tekst}</span>
                  {t.metadata?.goedkeuring === 'nodig' && t.status === 'pending' && (
                    <>
                      <button type="button" title="Goedkeuren" onClick={() => { void besluit(t, true); }} style={{ color: 'var(--success)' }}><Check size={14} /></button>
                      <button type="button" title="Afwijzen" onClick={() => { void besluit(t, false); }} style={{ color: 'var(--text-muted)' }}><X size={14} /></button>
                    </>
                  )}
                </div>
                {open === t.id && (
                  <div className="mt-2 text-[11px] whitespace-pre-wrap" style={{ color: 'var(--text-secondary)' }}>
                    {t.goal}
                    {t.description && <div className="mt-1" style={{ color: 'var(--text-muted)' }}>Waarom: {t.description}</div>}
                    {uitkomst && <div className="mt-2 pt-2" style={{ borderTop: '1px solid var(--border-subtle)' }}>{uitkomst}</div>}
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
