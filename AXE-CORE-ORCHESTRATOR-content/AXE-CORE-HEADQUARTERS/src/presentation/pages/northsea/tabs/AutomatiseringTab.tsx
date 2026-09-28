/**
 * Automation: wat NorthSea automatisch doet, en wat nooit.
 *
 * Geen tweede automatiseringsmotor (AUTOMATIONS.md, CRONJOBS.md): dit scherm toont
 *   - de Communication Engine (P1): echte runs uit northsea_audit_events, de
 *     follow-up-plannen, open Chase-items, en de runs van job `northsea:engine`
 *     uit het grootboek van de ene planner;
 *   - het beleid uit `deal_automation_policy` (wat mag zonder mens);
 *   - de sourcing-campagnes die lopen;
 *   - de log van `deal_events`, gekleurd met gebeurtenisToon (status.ts).
 * AXE-cronjobs beheer je in de Cron Manager; die blijft de enige planner.
 *
 * De gevoelige schakelaars (identiteit onthullen, prijs accepteren, tekenen,
 * bankgegevens wijzigen) horen uit te staan. Staat er één aan, dan is dat rood.
 */
import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router';
import { ArrowRight, DollarSign, Workflow } from 'lucide-react';
import { TabRail } from '@/presentation/components/layout/useTabRail';
import { tijdGeleden } from '@/domain/northsea/chase';
import { past, tel } from '@/domain/northsea/tabs/lijsten';
import { gebeurtenisToon, mensLabel, TOON_KLEUR, type Toon } from '@/domain/northsea/tabs/status';
import type { AutomatiseringsBeleid } from '@/domain/northsea/tabs/typen';
import { blokkadeToon, eigenaarLabel } from '@/domain/northsea/engine';
import {
  ledgerList, northseaLiveOperations, type LedgerEntry, type NorthseaLiveOperations,
} from '@/infrastructure/gateways/axeCoreApiService';
import { perplexityBudgetStand } from '@/infrastructure/gateways/perplexityResearchService';
import type { PerplexityBudget } from '@/domain/perplexityAgent';
import {
  DetailPaneel, Filters, FoutRegel, Kengetal, KengetalRij, Label, LegeStaat, VerversKnop, Vlak, Zoekveld,
} from './bouwstenen';
import { useNorthseaTab } from './useNorthseaTab';

/** "in 12m" / "overdue": voor een toekomstige `next_run_at`. tijdGeleden (chase.ts) is voor het verleden. */
function tijdTot(iso: string | null | undefined, nu: number): string {
  if (!iso) return '—';
  const ms = Date.parse(iso) - nu;
  if (!Number.isFinite(ms)) return '—';
  if (ms <= 0) return 'overdue';
  const min = Math.round(ms / 60_000);
  if (min < 60) return `in ${min}m`;
  const uur = Math.round(min / 60);
  return uur < 24 ? `in ${uur}h` : `in ${Math.round(uur / 24)}d`;
}

const SCHAKELAARS: ReadonlyArray<{ sleutel: keyof AutomatiseringsBeleid; label: string; gevoelig: boolean }> = [
  { sleutel: 'auto_send_qualification', label: 'Send qualification emails', gevoelig: false },
  { sleutel: 'auto_send_followups', label: 'Send follow-ups', gevoelig: false },
  { sleutel: 'auto_reply_nonbinding', label: 'Reply to non-binding messages', gevoelig: false },
  { sleutel: 'auto_disclose_counterparty_identity', label: 'Disclose counterparty identity', gevoelig: true },
  { sleutel: 'auto_accept_pricing', label: 'Accept pricing', gevoelig: true },
  { sleutel: 'auto_sign_documents', label: 'Sign documents', gevoelig: true },
  { sleutel: 'auto_change_banking', label: 'Change banking details', gevoelig: true },
];

function schakelaarToon(aan: boolean | null | undefined, gevoelig: boolean): { toon: Toon; tekst: string } {
  if (aan === null || aan === undefined) return { toon: 'grijs', tekst: 'Not set' };
  if (gevoelig) return aan ? { toon: 'rood', tekst: 'ON — not allowed' } : { toon: 'groen', tekst: 'Off (human only)' };
  return aan ? { toon: 'paars', tekst: 'Automatic' } : { toon: 'grijs', tekst: 'Manual' };
}

export function AutomatiseringTab() {
  const { data, fout, bezig, ververs } = useNorthseaTab('automatisering');
  const [weergave, setWeergave] = useState<'engine' | 'operations' | 'log' | 'campagnes'>('engine');
  /* De planner-runs komen van de VPS (/ledger), los van de tabdata: faalt dat,
     dan blijft de rest van het scherm staan en staat de reden erbij. */
  const [planner, setPlanner] = useState<{ runs: LedgerEntry[]; fout?: string } | null>(null);
  useEffect(() => {
    let weg = false;
    void ledgerList({ app: 'northsea', source: 'schedule', hours: 72, limit: 60 })
      .then(runs => { if (!weg) setPlanner({ runs }); })
      .catch(e => { if (!weg) setPlanner({ runs: [], fout: e instanceof Error ? e.message : 'ledger onbereikbaar' }); });
    return () => { weg = true; };
  }, [data]);
  /* Live operations (northsea_get_live_operations) en het gedeelde Perplexity-dagbudget komen via
     de governed MCP-actiepoort, niet via TAB_SQL: geen tweede databron, wel een tweede aanroep, dus
     elk los met zijn eigen foutafhandeling zodat de rest van het scherm blijft staan als één faalt. */
  const [ops, setOps] = useState<{ data: NorthseaLiveOperations | null; fout?: string }>({ data: null });
  useEffect(() => {
    let weg = false;
    void northseaLiveOperations()
      .then(d => { if (!weg) setOps({ data: d }); })
      .catch(e => { if (!weg) setOps({ data: null, fout: e instanceof Error ? e.message : 'live operations onbereikbaar' }); });
    return () => { weg = true; };
  }, [data]);
  const [budget, setBudget] = useState<{ waarde: PerplexityBudget | null; fout?: string }>({ waarde: null });
  useEffect(() => {
    let weg = false;
    void perplexityBudgetStand().then(u => {
      if (weg) return;
      setBudget(u.ok ? { waarde: u.budget } : { waarde: null, fout: u.error });
    });
    return () => { weg = true; };
  }, [data]);
  const [zoek, setZoek] = useState('');
  const [nu, setNu] = useState(() => Date.now());
  useEffect(() => { const t = setInterval(() => setNu(Date.now()), 60_000); return () => clearInterval(t); }, []);

  const log = useMemo(() => (data?.gebeurtenissen ?? []).filter(g => past(zoek, g.soort, g.samenvatting, g.actor, g.deal_code)), [data, zoek]);
  const campagnes = useMemo(() => (data?.campagnes ?? []).filter(c => past(zoek, c.commodity, c.product, c.richting, c.volgende, (c.gebieden ?? []).join(' '))), [data, zoek]);
  const week = 7 * 24 * 3600 * 1000;
  const alleLog = data?.gebeurtenissen ?? [];
  const dezeWeek = alleLog.filter(g => g.created_at && nu - Date.parse(g.created_at) < week).length;
  const fouten = alleLog.filter(g => gebeurtenisToon(g.soort) === 'rood').length;
  const alleCampagnes = data?.campagnes ?? [];
  const beleid = data?.beleid ?? null;
  const gevoeligAan = beleid ? SCHAKELAARS.filter(s => s.gevoelig && beleid[s.sleutel] === true).length : 0;
  const soorten = tel(alleLog, g => g.soort).slice(0, 8);
  const engine = data?.engine ?? null;
  const laatsteRun = engine?.runs[0] ?? null;
  const openPlannen = (engine?.followups ?? []).filter(f => f.status === 'scheduled' || f.status === 'draft_created').reduce((n, f) => n + f.aantal, 0);
  const plannerFouten = (planner?.runs ?? []).filter(r => !['ok', 'success', 'skipped'].includes(r.status)).length;

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3 px-3 pb-3 pt-2" data-axe-doel="northsea-automatisering">
      <KengetalRij>
        <Kengetal waarde={laatsteRun ? tijdGeleden(laatsteRun.op, nu) : (data ? 'Never' : '—')} label="Engine last run" toon="paars"
          sub={data ? (laatsteRun ? `${(laatsteRun.fouten ?? []).length} errors` : 'No engine run recorded') : undefined} />
        <Kengetal waarde={data ? openPlannen : '—'} label="Open follow-ups" sub="Drafts wait for approval" />
        <Kengetal waarde={data ? (engine?.chase_open ?? 0) : '—'} label="Engine Chase items" toon="oranje" />
        <Kengetal waarde={data ? alleCampagnes.filter(c => c.status === 'active').length : '—'} label="Active campaigns" toon="paars" />
        <Kengetal waarde={data ? dezeWeek : '—'} label="Events this week" toon="blauw" />
        <Kengetal waarde={data ? fouten : '—'} label="Failures" toon="rood" sub={data ? (fouten ? 'Bounces or delivery failures' : 'None recorded') : undefined} />
      </KengetalRij>

      <Vlak vul titel={<span className="flex items-center gap-2"><Workflow size={15} style={{ color: '#FB923C' }} />Automation</span>}
        sub="NorthSea automation runs on AXE CORE's engine and scheduler. This view shows what ran and what is allowed."
        acties={(
          <>
            <div className="w-[240px]"><Zoekveld waarde={zoek} zet={setZoek} plaats={weergave === 'log' ? 'Search activity…' : 'Search campaigns…'} /></div>
            {/* Explicit type argument: TS's inference for Filters<T> here otherwise widens T to
                plain string (mixing a `number` and a `number | undefined` aantal across the
                array's entries defeats per-element literal inference), which then rejects the
                narrowly-typed setWeergave. Naming T is simpler and more robust than reshaping
                the data just to satisfy inference. */}
            <Filters<'engine' | 'operations' | 'log' | 'campagnes'> opties={[{ id: 'engine', label: 'Engine', aantal: engine?.runs.length ?? 0 }, { id: 'operations', label: 'Operations', aantal: ops.data?.approval_required.count }, { id: 'log', label: 'Activity', aantal: alleLog.length }, { id: 'campagnes', label: 'Sourcing campaigns', aantal: alleCampagnes.length }] as const}
              actief={weergave} kies={setWeergave} />
            <VerversKnop bezig={bezig} ververs={ververs} />
          </>
        )}>
        {/* Operations heeft zijn eigen, onafhankelijke bron (northsea_get_live_operations + het
            Perplexity-budget, via de governed actiepoort) -- niet TAB_SQL. Een 502 op de TAB_SQL-kant
            (bv. de externe-SSD-sleutels zijn niet gemount) mag Operations dus niet blokkeren: `ops`/
            `budget` hebben allebei hun eigen foutregel binnen dat blok. */}
        {weergave !== 'operations' && fout && <FoutRegel fout={fout} />}
        {weergave !== 'operations' && !fout && !data && <LegeStaat titel="Loading automation…" />}
        {data && weergave === 'engine' && (
          <div className="grid gap-4 px-4 pb-3 lg:grid-cols-2">
            <section>
              <div className="mb-1.5 text-[10.5px] font-semibold uppercase tracking-[0.08em]" style={{ color: 'var(--text-muted)' }}>Engine runs (audit)</div>
              {!engine && <div className="text-[11.5px]" style={{ color: 'var(--text-muted)' }}>The engine is not installed on this database yet.</div>}
              {engine && engine.runs.length === 0 && <div className="text-[11.5px]" style={{ color: 'var(--text-muted)' }}>No engine run recorded.</div>}
              <ul className="flex flex-col">
                {(engine?.runs ?? []).map(r => {
                  const fouten = r.fouten ?? [];
                  const som = Object.entries(r.samenvatting ?? {}).filter(([, n]) => n > 0).map(([k, n]) => `${mensLabel(k)} ${n}`).join(' · ');
                  return (
                    <li key={r.op} className="flex gap-2 py-1.5" style={{ borderTop: '1px solid rgba(255,255,255,0.035)' }}>
                      <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full" style={{ background: TOON_KLEUR[fouten.length ? 'rood' : 'groen'] }} />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-baseline gap-2 text-[12px]">
                          <span className="truncate" style={{ color: 'var(--text-primary)' }}>{som || 'No changes'}</span>
                          <span className="ml-auto shrink-0 text-[10.5px]" style={{ color: 'var(--text-muted)' }}>{tijdGeleden(r.op, nu)}</span>
                        </div>
                        {fouten.slice(0, 3).map((f, i) => (
                          <div key={i} className="truncate text-[11px]" style={{ color: TOON_KLEUR.rood }} title={f}>{f}</div>
                        ))}
                      </div>
                    </li>
                  );
                })}
              </ul>
            </section>
            <section>
              <div className="mb-1.5 text-[10.5px] font-semibold uppercase tracking-[0.08em]" style={{ color: 'var(--text-muted)' }}>Scheduler runs · northsea:engine</div>
              {planner?.fout && <div className="text-[11.5px]" style={{ color: TOON_KLEUR.rood }}>Ledger unavailable — {planner.fout}</div>}
              {planner && !planner.fout && planner.runs.length === 0 && (
                <div className="text-[11.5px]" style={{ color: 'var(--text-muted)' }}>No scheduled NorthSea job ran in the last 72 h.</div>
              )}
              <ul className="flex flex-col">
                {(planner?.runs ?? []).slice(0, 12).map(r => (
                  <li key={`${r.ref_id}:${r.at}`} className="flex items-baseline gap-2 py-1 text-[11.5px]" style={{ borderTop: '1px solid rgba(255,255,255,0.035)' }}>
                    <Label toon={r.status === 'ok' || r.status === 'success' ? 'groen' : r.status === 'skipped' ? 'grijs' : r.status === 'running' ? 'blauw' : 'rood'}>{mensLabel(r.status)}</Label>
                    <span className="min-w-0 flex-1 truncate" style={{ color: 'var(--text-secondary)' }} title={r.detail}>{r.detail || r.name}</span>
                    <span className="shrink-0 text-[10.5px]" style={{ color: 'var(--text-muted)' }}>{tijdGeleden(r.at, nu)}</span>
                  </li>
                ))}
              </ul>
              <div className="mb-1.5 mt-4 text-[10.5px] font-semibold uppercase tracking-[0.08em]" style={{ color: 'var(--text-muted)' }}>Deals by current blocker</div>
              <ul className="flex flex-col gap-1">
                {(engine?.blokkades ?? []).slice().sort((a, b) => b.aantal - a.aantal).map(b => (
                  <li key={`${b.code}:${b.eigenaar}`} className="flex items-center gap-2 text-[11.5px]">
                    <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: TOON_KLEUR[blokkadeToon(b.code)] }} />
                    <span className="flex-1 truncate" style={{ color: 'var(--text-secondary)' }}>{mensLabel(b.code)}</span>
                    <span style={{ color: 'var(--text-muted)' }}>{eigenaarLabel(b.eigenaar)}</span>
                    <span className="w-6 text-right tabular-nums" style={{ color: 'var(--text-primary)' }}>{b.aantal}</span>
                  </li>
                ))}
              </ul>
              <div className="mb-1.5 mt-4 text-[10.5px] font-semibold uppercase tracking-[0.08em]" style={{ color: 'var(--text-muted)' }}>Follow-up plans</div>
              <div className="flex flex-wrap gap-1.5">
                {(engine?.followups ?? []).length === 0 && <span className="text-[11.5px]" style={{ color: 'var(--text-muted)' }}>None planned.</span>}
                {(engine?.followups ?? []).map(f => (
                  <Label key={f.status} toon={f.status === 'blocked' ? 'rood' : f.status === 'draft_created' ? 'oranje' : 'grijs'}>{mensLabel(f.status)} {f.aantal}</Label>
                ))}
              </div>
              <div className="mb-1.5 mt-4 text-[10.5px] font-semibold uppercase tracking-[0.08em]" style={{ color: 'var(--text-muted)' }}>CrewAI runs</div>
              {(engine?.crewai ?? []).length === 0 && <div className="text-[11.5px]" style={{ color: 'var(--text-muted)' }}>No CrewAI run recorded.</div>}
              <ul className="flex flex-col">
                {(engine?.crewai ?? []).slice(0, 12).map(r => (
                  <li key={`${r.op}:${r.route}:${r.deal_id}`} className="flex flex-col gap-0.5 py-1.5" style={{ borderTop: '1px solid rgba(255,255,255,0.035)' }}>
                    <div className="flex items-baseline gap-2 text-[12px]">
                      <Label toon={r.status === 'ok' ? 'groen' : r.fallback ? 'oranje' : 'rood'}>{mensLabel(r.status || 'unknown')}</Label>
                      <span className="min-w-0 flex-1 truncate" style={{ color: 'var(--text-primary)' }}>{r.crew || r.route || 'crew'}</span>
                      <span className="shrink-0 text-[10.5px]" style={{ color: 'var(--text-muted)' }}>{tijdGeleden(r.op, nu)}</span>
                    </div>
                    <div className="truncate text-[11px]" style={{ color: 'var(--text-muted)' }}>
                      {[r.backend, r.fallback ? 'fallback' : null, r.approval_required ? 'approval required' : null, r.next_action, r.error].filter(Boolean).join(' · ')}
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          </div>
        )}
        {weergave === 'operations' && (
          <div className="grid gap-4 px-4 pb-3 lg:grid-cols-2">
            <section>
              <div className="mb-1.5 flex items-center gap-1.5 text-[10.5px] font-semibold uppercase tracking-[0.08em]" style={{ color: 'var(--text-muted)' }}>
                <DollarSign size={11} />Research budget · shared with discovery
              </div>
              {ops.fout && <div className="mb-2 text-[11.5px]" style={{ color: TOON_KLEUR.rood }}>Live operations unavailable — {ops.fout}</div>}
              {budget.fout && <div className="mb-2 text-[11.5px]" style={{ color: TOON_KLEUR.rood }}>Budget unavailable — {budget.fout}</div>}
              {!budget.waarde && !budget.fout && <div className="text-[11.5px]" style={{ color: 'var(--text-muted)' }}>Loading…</div>}
              {budget.waarde && (
                budget.waarde.configured ? (
                  <div className="flex gap-2.5 pb-2">
                    <Kengetal waarde={`$${budget.waarde.usdLeft.toFixed(2)}`} label="USD left today"
                      sub={`of $${budget.waarde.dailyUsd.toFixed(2)}/day`} toon={budget.waarde.usdLeft <= 0 ? 'rood' : 'paars'} />
                    <Kengetal waarde={budget.waarde.questionsLeft} label="Perplexity calls left"
                      sub={`of ${budget.waarde.dailyQuestions}/day`} toon={budget.waarde.questionsLeft <= 0 ? 'rood' : 'paars'} />
                  </div>
                ) : <div className="text-[11.5px]" style={{ color: 'var(--text-muted)' }}>Perplexity is not configured on the server.</div>
              )}

              <div className="mb-1.5 mt-3 text-[10.5px] font-semibold uppercase tracking-[0.08em]" style={{ color: 'var(--text-muted)' }}>Recently completed</div>
              {ops.data && ops.data.recently_completed.length === 0 && <div className="text-[11.5px]" style={{ color: 'var(--text-muted)' }}>Nothing recorded yet.</div>}
              <ul className="flex flex-col">
                {(ops.data?.recently_completed ?? []).map((r, i) => (
                  <li key={`${r.actor}:${r.action}:${i}`} className="flex flex-col gap-0.5 py-1.5" style={{ borderTop: '1px solid rgba(255,255,255,0.035)' }}>
                    <div className="flex items-baseline gap-2 text-[12px]">
                      <Label toon="blauw">{mensLabel(r.actor)}</Label>
                      <span className="min-w-0 flex-1 truncate" style={{ color: 'var(--text-primary)' }}>{mensLabel(r.action)}</span>
                      <span className="shrink-0 text-[10.5px]" style={{ color: 'var(--text-muted)' }}>{r.at ? tijdGeleden(r.at, nu) : '—'}</span>
                    </div>
                    {r.summary != null && (
                      <div className="truncate text-[11px]" style={{ color: 'var(--text-muted)' }}
                        title={typeof r.summary === 'string' ? r.summary : JSON.stringify(r.summary)}>
                        {typeof r.summary === 'string' ? r.summary : JSON.stringify(r.summary)}
                      </div>
                    )}
                  </li>
                ))}
              </ul>

              <div className="mb-1.5 mt-4 text-[10.5px] font-semibold uppercase tracking-[0.08em]" style={{ color: 'var(--text-muted)' }}>Next scheduled run · northsea:engine</div>
              {ops.data && 'next_run_at' in ops.data.next_scheduled ? (
                <div className="flex flex-col gap-1 text-[11.5px]" style={{ color: 'var(--text-secondary)' }}>
                  <div className="flex items-center gap-2">
                    <Label toon={ops.data.next_scheduled.last_status === 'ok' ? 'groen' : ops.data.next_scheduled.last_status ? 'rood' : 'grijs'}>
                      {mensLabel(ops.data.next_scheduled.last_status || 'unknown')}
                    </Label>
                    <span>Next run {tijdTot(ops.data.next_scheduled.next_run_at, nu)}</span>
                  </div>
                  <span style={{ color: 'var(--text-muted)' }}>
                    Last ran {ops.data.next_scheduled.last_run_at ? tijdGeleden(ops.data.next_scheduled.last_run_at, nu) : '—'}
                    {(ops.data.next_scheduled.consecutive_failures ?? 0) > 0 && (
                      <span style={{ color: TOON_KLEUR.rood }}> · {ops.data.next_scheduled.consecutive_failures} consecutive failure{ops.data.next_scheduled.consecutive_failures === 1 ? '' : 's'}</span>
                    )}
                  </span>
                </div>
              ) : (
                <div className="text-[11.5px]" style={{ color: 'var(--text-muted)' }}>{ops.data?.next_scheduled.note ?? (ops.data ? 'No schedule found.' : 'Loading…')}</div>
              )}
            </section>
            <section>
              <div className="mb-1.5 text-[10.5px] font-semibold uppercase tracking-[0.08em]" style={{ color: 'var(--text-muted)' }}>
                Waiting {ops.data ? `(${ops.data.waiting.followups_scheduled} follow-ups · ${ops.data.waiting.chase_waiting_reply} Chase)` : ''}
              </div>
              {ops.data && ops.data.waiting.items.length === 0 && <div className="text-[11.5px]" style={{ color: 'var(--text-muted)' }}>Nothing waiting on a reply.</div>}
              <ul className="flex flex-col gap-1">
                {(ops.data?.waiting.items ?? []).map((w, i) => (
                  <li key={`${w.deal_id}:${i}`} className="flex items-center gap-2 text-[11.5px]" style={{ color: 'var(--text-secondary)' }}>
                    <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: TOON_KLEUR.blauw }} />
                    <span className="min-w-0 flex-1 truncate" title={w.reason ?? undefined}>{w.reason || 'Follow-up scheduled'}</span>
                    <span className="shrink-0 text-[10.5px]" style={{ color: 'var(--text-muted)' }}>{w.due_at ? tijdTot(w.due_at, nu) : '—'}</span>
                  </li>
                ))}
              </ul>

              <div className="mb-1.5 mt-4 text-[10.5px] font-semibold uppercase tracking-[0.08em]" style={{ color: 'var(--text-muted)' }}>
                Approval required {ops.data ? `(${ops.data.approval_required.count})` : ''}
              </div>
              {ops.data && ops.data.approval_required.items.length === 0 && <div className="text-[11.5px]" style={{ color: 'var(--text-muted)' }}>Nothing waiting on a human.</div>}
              <ul className="flex flex-col">
                {(ops.data?.approval_required.items ?? []).slice(0, 10).map(a => (
                  <li key={a.approval_id} className="flex items-baseline gap-2 py-1 text-[11.5px]" style={{ borderTop: '1px solid rgba(255,255,255,0.035)' }}>
                    <Label toon="oranje">{mensLabel(a.kind)}</Label>
                    <span className="min-w-0 flex-1 truncate" style={{ color: 'var(--text-secondary)' }} title={a.gate ?? undefined}>{a.subject || a.gate || '—'}</span>
                    <span className="shrink-0 text-[10.5px]" style={{ color: 'var(--text-muted)' }}>{a.updated_at ? tijdGeleden(a.updated_at, nu) : ''}</span>
                  </li>
                ))}
              </ul>

              <div className="mb-1.5 mt-4 text-[10.5px] font-semibold uppercase tracking-[0.08em]" style={{ color: 'var(--text-muted)' }}>Failed / retries</div>
              {ops.data && !ops.data.failed.last_failed_tick_at && ops.data.failed.research_failed_permanently.length === 0
                && ops.data.failed.crew_reviews_skipped_recent.length === 0 && (
                <div className="text-[11.5px]" style={{ color: 'var(--text-muted)' }}>Nothing failed recently.</div>
              )}
              {ops.data?.failed.last_failed_tick_at && (
                <div className="text-[11.5px]" style={{ color: TOON_KLEUR.rood }}>Engine tick failed {tijdGeleden(ops.data.failed.last_failed_tick_at, nu)}.</div>
              )}
              {(ops.data?.failed.research_failed_permanently ?? []).map(r => (
                <div key={r.action_queue_id} className="truncate text-[11.5px]" style={{ color: TOON_KLEUR.rood }} title={r.blocker ?? undefined}>
                  Research gave up: {mensLabel(r.blocker || 'unknown blocker')}
                </div>
              ))}
              {(ops.data?.failed.crew_reviews_skipped_recent ?? []).slice(0, 5).map((s, i) => (
                <div key={i} className="truncate text-[11.5px]" style={{ color: 'var(--text-muted)' }} title={s.reason ?? undefined}>
                  Crew review skipped {s.at ? tijdGeleden(s.at, nu) : ''}: {s.reason || 'no reason recorded'}
                </div>
              ))}
            </section>
          </div>
        )}
        {data && weergave === 'log' && (log.length === 0 ? <LegeStaat titel="No automation activity matches" /> : (
          <ul className="px-2 pb-2">
            {log.map(g => {
              const kleur = TOON_KLEUR[gebeurtenisToon(g.soort)];
              return (
                <li key={g.id} className="flex gap-3 rounded-lg px-2 py-2" style={{ borderTop: '1px solid rgba(255,255,255,0.035)' }}>
                  <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full" style={{ background: kleur }} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline gap-2">
                      <span className="truncate text-[12.5px] font-medium" style={{ color: 'var(--text-primary)' }}>{mensLabel(g.soort)}</span>
                      {g.deal_code && <Label toon="blauw">{g.deal_code}</Label>}
                      <span className="ml-auto shrink-0 text-[10.5px]" style={{ color: 'var(--text-muted)' }}>{g.created_at ? tijdGeleden(g.created_at, nu) : ''}</span>
                    </div>
                    {g.samenvatting && <div className="truncate text-[11.5px]" style={{ color: 'var(--text-secondary)' }} title={g.samenvatting}>{g.samenvatting}</div>}
                    {g.actor && <div className="text-[10.5px]" style={{ color: 'var(--text-muted)' }}>by {g.actor}</div>}
                  </div>
                </li>
              );
            })}
          </ul>
        ))}
        {data && weergave === 'campagnes' && (campagnes.length === 0 ? <LegeStaat titel="No campaigns match" /> : (
          <table className="w-full table-fixed border-collapse text-[12px]" style={{ minWidth: 820 }}>
            <colgroup><col style={{ width: 88 }} /><col /><col style={{ width: 170 }} /><col style={{ width: 80 }} /><col style={{ width: 150 }} /><col style={{ width: 200 }} /></colgroup>
            <thead className="sticky top-0 z-[1]" style={{ background: 'var(--axe-vak-vlak)' }}>
              <tr>{['Direction', 'Commodity', 'Regions', 'Status', 'Found · contacted · qualified', 'Next action'].map(k => (
                <th key={k} className="truncate px-3 py-1.5 text-left text-[10.5px] font-medium" style={{ color: 'var(--text-muted)' }}>{k}</th>
              ))}</tr>
            </thead>
            <tbody>
              {campagnes.map(c => (
                <tr key={c.id} style={{ borderTop: '1px solid rgba(255,255,255,0.035)' }}>
                  <td className="truncate px-3 py-2" style={{ color: 'var(--text-secondary)' }}>{mensLabel(c.richting)}</td>
                  <td className="truncate px-3 py-2" style={{ color: 'var(--text-primary)' }}>{[c.product, c.commodity].filter(Boolean).join(' · ') || '—'}</td>
                  <td className="truncate px-3 py-2" style={{ color: 'var(--text-secondary)' }} title={(c.gebieden ?? []).join(', ')}>{(c.gebieden ?? []).join(', ') || '—'}</td>
                  <td className="truncate px-3 py-2"><Label toon={c.status === 'active' ? 'paars' : 'grijs'}>{mensLabel(c.status)}</Label></td>
                  <td className="truncate px-3 py-2 tabular-nums" style={{ color: 'var(--text-secondary)' }}>{c.gevonden ?? 0} · {c.benaderd ?? 0} · {c.gekwalificeerd ?? 0}</td>
                  <td className="truncate px-3 py-2" style={{ color: 'var(--text-secondary)' }} title={c.volgende ?? undefined}>{c.volgende || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ))}
      </Vlak>

      <TabRail kant="rechts">
        <DetailPaneel titel="Automation policy" sub={beleid?.updated_at ? `Updated ${tijdGeleden(beleid.updated_at, nu)}` : 'deal_automation_policy'}>
          {!beleid && <div className="text-[11.5px]" style={{ color: 'var(--text-muted)' }}>{data ? 'No automation policy recorded.' : 'Loading…'}</div>}
          {beleid && (
            <>
              {gevoeligAan > 0 && (
                <div className="mb-3 rounded-lg bg-white/[0.03] p-2 text-[11.5px]" style={{ border: '1px solid rgba(248,113,113,0.35)', color: '#F87171' }}>
                  {gevoeligAan} sensitive action{gevoeligAan > 1 ? 's are' : ' is'} set to automatic. Binding commitments need approved authority.
                </div>
              )}
              <ul className="flex flex-col gap-1.5">
                {SCHAKELAARS.map(s => {
                  const { toon, tekst } = schakelaarToon(beleid[s.sleutel] as boolean | null | undefined, s.gevoelig);
                  return (
                    <li key={s.sleutel} className="flex items-center gap-2 text-[12px]">
                      <span className="flex-1" style={{ color: 'var(--text-secondary)' }}>{s.label}</span>
                      <Label toon={toon}>{tekst}</Label>
                    </li>
                  );
                })}
              </ul>
              <div className="mt-3 flex flex-col gap-1 text-[11.5px]" style={{ color: 'var(--text-muted)' }}>
                <span>Follow-up every {beleid.followup_interval_hours ?? '—'} h, at most {beleid.max_auto_followups ?? '—'} automatic follow-ups.</span>
                {beleid.operational_mailbox && <span>Mailbox: {beleid.operational_mailbox}</span>}
              </div>
            </>
          )}

          <div className="mb-1 mt-4 text-[10.5px] font-semibold uppercase tracking-[0.08em]" style={{ color: 'var(--text-muted)' }}>Most frequent events</div>
          <div className="flex flex-col gap-1">
            {soorten.map(s => (
              <div key={s.sleutel} className="flex items-center gap-2 text-[11.5px]">
                <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: TOON_KLEUR[gebeurtenisToon(s.sleutel)] }} />
                <span className="flex-1 truncate" style={{ color: 'var(--text-secondary)' }}>{mensLabel(s.sleutel)}</span>
                <span className="tabular-nums" style={{ color: 'var(--text-primary)' }}>{s.aantal}</span>
              </div>
            ))}
          </div>

          <div className="mt-3 text-[11.5px]" style={{ color: 'var(--text-muted)' }}>
            The engine never sends: follow-ups become pending drafts, and every send needs a human approver.
            {plannerFouten > 0 && <span style={{ color: TOON_KLEUR.rood }}> {plannerFouten} scheduler run{plannerFouten > 1 ? 's' : ''} failed in 72 h.</span>}
          </div>
          <Link to="/ledger" className="mt-3 inline-flex items-center gap-1.5 text-[12px]" style={{ color: 'var(--accent-cyan)' }}>
            All runs in the Ledger <ArrowRight size={12} />
          </Link>
          <Link to="/cron-manager" className="mt-1.5 inline-flex items-center gap-1.5 text-[12px]" style={{ color: 'var(--accent-cyan)' }}>
            Scheduled jobs live in the Cron Manager <ArrowRight size={12} />
          </Link>
          <Link to="/tasks" className="mt-1.5 inline-flex items-center gap-1.5 text-[12px]" style={{ color: 'var(--accent-cyan)' }}>
            Open AXE Tasks <ArrowRight size={12} />
          </Link>
        </DetailPaneel>
      </TabRail>
    </div>
  );
}
