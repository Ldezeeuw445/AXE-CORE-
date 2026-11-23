/**
 * Het grootboek: alles wat AXE deed, van elke app, op één plek.
 *
 * Jobs van de eigen planner (VPS en Mac), de Supabase-cron van Companion en AXON
 * Memory, en de taken. Elke regel in de kleur van zijn app (domain/apps.ts); of het
 * gelukt is staat in het woord ernaast. Links kies je de bron, rechts de app.
 *
 * Wat hier NIET staat: verzonnen standen. Een regel komt uit /ledger, en die leest
 * core_job_runs, cron.job_run_details en core_tasks zoals ze zijn.
 */
import { useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { Bot, CalendarClock, Database, HardDrive, Layers, ListTodo, RefreshCw } from 'lucide-react';
import { TopbalkSlot } from '@/presentation/components/layout/TopbalkSlot';
import { PlaatSlot } from '@/presentation/components/layout/PlaatSlots';
import { IcoonZuil, type ZuilItem } from '@/presentation/components/layout/IcoonZuil';
import { AppZuil, appGroep } from '@/presentation/components/layout/AppZuil';
import { SchuifBalk } from '@/presentation/components/layout/tabMaatstaf';
import { TabRail } from '@/presentation/components/layout/useTabRail';
import { appMeta } from '@/domain/apps';
import {
  appVanRegel, bronWoord, duurTekst, filterRegels, standUitTotalen, statusWoord, uitkomst, type AppFilter, type GrootboekTotaal,
} from '@/domain/grootboek';
import { calendarJobs, ledgerOverview, type CalendarJob, type LedgerEntry } from '@/infrastructure/gateways/axeCoreApiService';
import { KpiRij } from '@/presentation/components/settings/StatusKaart';

const BRONNEN: ZuilItem[] = [
  { id: 'alle', label: 'All', kleur: 'var(--text-primary)', icoon: <Layers size={17} /> },
  { id: 'schedule', label: 'Jobs (VPS and Mac)', kleur: '#22D3EE', icoon: <CalendarClock size={17} /> },
  { id: 'pg_cron', label: 'Supabase cron', kleur: '#A78BFA', icoon: <Database size={17} /> },
  { id: 'task', label: 'Tasks', kleur: '#34D399', icoon: <ListTodo size={17} /> },
  { id: 'launchd', label: 'Mac maintenance', kleur: '#F5A524', icoon: <HardDrive size={17} /> },
  { id: 'planner', label: 'Planner', kleur: '#F472B6', icoon: <Bot size={17} /> },
];

const VENSTERS = [{ uren: 24, label: '24 hours' }, { uren: 168, label: '7 days' }, { uren: 720, label: '30 days' }];

const STAND: Record<string, string> = { goed: 'goed', fout: 'stuk', bezig: 'nieuw', open: 'uit' };

function tijd(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  const vandaag = new Date().toDateString() === d.toDateString();
  return d.toLocaleString('nl-NL', vandaag ? { hour: '2-digit', minute: '2-digit' } : { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
}

export default function Grootboek() {
  const [app, setApp] = useState<AppFilter>('alle');
  const [bron, setBron] = useState<string>('alle');
  const [uren, setUren] = useState(168);
  const [regels, setRegels] = useState<LedgerEntry[]>([]);
  const [totalen, setTotalen] = useState<GrootboekTotaal[] | null>(null);
  const [alleenFout, setAlleenFout] = useState(false);
  const [jobs, setJobs] = useState<CalendarJob[]>([]);
  const [bezig, setBezig] = useState(false);
  const [fout, setFout] = useState<string | null>(null);

  const haal = async () => {
    setBezig(true);
    const [r, j] = await Promise.allSettled([
      ledgerOverview({ hours: uren, limit: 1000, failsOnly: alleenFout }),
      calendarJobs(new Date(), new Date(Date.now() + 24 * 3600 * 1000)),
    ]);
    if (r.status === 'fulfilled') { setRegels(r.value.entries); setTotalen(r.value.totals as GrootboekTotaal[]); setFout(null); } else { setFout(String(r.reason?.message ?? r.reason)); }
    if (j.status === 'fulfilled') setJobs(j.value.jobs);
    setBezig(false);
  };

  useEffect(() => {
    // Buiten de effect-body: eerst renderen, dan laden (geen cascade van renders).
    const eerst = setTimeout(() => { void haal(); }, 0);
    const t = setInterval(() => { void haal(); }, 60_000);
    return () => { clearTimeout(eerst); clearInterval(t); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [uren, alleenFout]);

  const zichtbaar = useMemo(() => filterRegels(regels, app, bron), [regels, app, bron]);
  // Tellers van de server over het HELE venster (core_ledger_stand), niet van de afgekapte regels.
  const stand = useMemo(() => standUitTotalen((totalen ?? []).filter(t => bron === 'alle' || t.source === bron)), [totalen, bron]);
  const som = stand.reduce((a, s) => ({ totaal: a.totaal + s.totaal, goed: a.goed + s.goed, fout: a.fout + s.fout, bezig: a.bezig + s.bezig }),
    { totaal: 0, goed: 0, fout: 0, bezig: 0 });
  const slaagt = som.goed + som.fout ? Math.round((som.goed / (som.goed + som.fout)) * 1000) / 10 : null;
  const mislukt = som.fout;
  const laden = totalen === null;
  const zichtbareJobs = jobs
    .filter(j => app === 'alle' || appVanRegel(j.app) === app)
    .sort((a, b) => (a.next_run_at ?? '9').localeCompare(b.next_run_at ?? '9'));

  return (
    <motion.div className="axe-tabruimte axe-ledger-v3 flex min-h-0 flex-1 flex-col pt-4 sm:pt-6" data-axe-ledger="v3" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.3 }}>
      <TopbalkSlot>
        <span className="text-[10px] font-mono-data" style={{ color: 'var(--text-secondary)' }}>
          {laden ? 'Loading…' : `${som.totaal} runs · ${mislukt} failed · ${VENSTERS.find(v => v.uren === uren)?.label}`}
        </span>
      </TopbalkSlot>

      <PlaatSlot slot="links">
        <IcoonZuil items={BRONNEN} actief={bron} kies={setBron} rijen={3} />
      </PlaatSlot>
      <PlaatSlot slot="rechts">
        <AppZuil actief={app} kies={setApp} />
      </PlaatSlot>

      <TabRail kant="links">
        <SchuifBalk
          groepen={[
            appGroep(app, setApp),
            {
              titel: 'Period',
              items: VENSTERS.map((v) => ({ id: String(v.uren), label: v.label, actief: uren === v.uren, onKies: () => setUren(v.uren) })),
            },
            {
              titel: 'Source',
              items: BRONNEN.map((b) => ({ id: b.id, label: b.label, actief: bron === b.id, onKies: () => setBron(b.id) })),
            },
          ]}
        />
      </TabRail>

      <TabRail kant="rechts">
        <div className="axe-paneel">
          <div className="mb-3 flex items-center gap-2">
            <CalendarClock size={15} style={{ color: 'var(--accent-cyan)' }} />
            <h2 className="flex-1 text-[15px] font-semibold" style={{ color: 'var(--text-primary)' }}>Jobs</h2>
          </div>
          {zichtbareJobs.length === 0 ? (
            <p className="text-xs" style={{ color: 'var(--text-muted)' }}>No jobs for this app.</p>
          ) : (
            <ul className="space-y-2">
              {zichtbareJobs.map(j => (
                <li key={j.job_key} className="text-xs">
                  <div className="truncate font-medium" style={{ color: appMeta(appVanRegel(j.app)).kleur }} title={j.description ?? j.naam}>{j.naam}</div>
                  <div className="flex gap-2" style={{ color: 'var(--text-muted)' }}>
                    <span>{bronWoord(j.bron === 'pg_cron' ? 'pg_cron' : 'schedule', j.executor)}</span>
                    <span className="font-mono-data">{j.cron}</span>
                    <span className="ml-auto">{j.enabled ? tijd(j.next_run_at) : 'uit'}</span>
                  </div>
                  {(j.consecutive_failures ?? 0) > 0 && (
                    <div style={{ color: 'var(--m-broken)' }}>{j.consecutive_failures}× op rij mislukt</div>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      </TabRail>

      <header className="axe-set-kop flex-none">
        <div>
          <h2>Ledger</h2>
          <p>Everything AXE ran, for every app: jobs on the VPS and Mac, Supabase cron and tasks. Counts cover the whole window.</p>
        </div>
        <div className="axe-set-pillen">
          {VENSTERS.map(v => (
            <button key={v.uren} type="button" onClick={() => setUren(v.uren)}
              className={`axe-set-pil${uren === v.uren ? ' is-info' : ''}`}>{v.label}</button>
          ))}
          <button type="button" onClick={() => setAlleenFout(v => !v)} className={`axe-set-pil${alleenFout ? ' is-bad' : ''}`}>
            Failures only
          </button>
          <button type="button" onClick={() => { void haal(); }} disabled={bezig} className="axe-set-pil inline-flex items-center gap-1.5">
            <RefreshCw size={11} className={bezig ? 'animate-spin' : ''} /> Refresh
          </button>
        </div>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {fout && <div className="mb-4 text-sm" style={{ color: 'var(--m-broken)' }}>Grootboek niet bereikbaar: {fout}</div>}

        <KpiRij tegels={[
          { label: 'Runs', waarde: laden ? '…' : som.totaal.toLocaleString('nl-NL'), sub: VENSTERS.find(v => v.uren === uren)?.label },
          { label: 'Failed', waarde: laden ? '…' : som.fout.toLocaleString('nl-NL'), toon: som.fout ? 'bad' : undefined,
            sub: stand.find(s2 => s2.laatsteFout)?.laatsteFout ? `last: ${[...stand].filter(s2 => s2.laatsteFout).sort((a, b) => b.laatsteFout!.at.localeCompare(a.laatsteFout!.at))[0].laatsteFout!.name}` : 'no failures' },
          { label: 'Success rate', waarde: slaagt == null ? '–' : `${slaagt}%`, toon: slaagt != null && slaagt < 95 ? 'warn' : 'ok', sub: 'finished runs' },
          { label: 'Running now', waarde: laden ? '…' : String(som.bezig), sub: 'tasks and jobs in progress' },
        ]} />

        {/* Per app de stand over het hele venster. Klik = die app. */}
        <div className="axe-gb-apps">
          {stand.map(s => {
            const m = appMeta(s.app);
            return (
              <button key={s.app} type="button" onClick={() => setApp(app === s.app ? 'alle' : s.app)}
                className="axe-gb-app" data-aan={app === s.app ? 'ja' : undefined} style={{ ['--app-kleur' as string]: m.kleur }}>
                <span className="axe-gb-app-titel" title={m.label}>{m.label}</span>
                <b>{laden ? '…' : s.totaal === 0 ? '0' : s.totaal.toLocaleString('nl-NL')}<small> runs</small></b>
                <span className="axe-gb-app-tellers">
                  <span className="is-ok">{s.goed.toLocaleString('nl-NL')} ok</span>
                  {s.fout > 0 && <span className="is-fout">{s.fout} failed</span>}
                  {s.bezig + s.open > 0 && <span>{s.bezig + s.open} open</span>}
                </span>
                {s.laatsteFout && (
                  <span className="axe-gb-app-fout" title={s.laatsteFout.name}>Last error · {s.laatsteFout.name} · {tijd(s.laatsteFout.at)}</span>
                )}
              </button>
            );
          })}
        </div>

        <section className="axe-cron">
          <div className="axe-cron-rol">
            <table className="axe-cron-tabel">
              <thead>
                <tr><th>Wanneer</th><th>App</th><th>Bron</th><th>Wat</th><th>Status</th><th className="axe-cron-r">Duur</th><th>Detail</th></tr>
              </thead>
              <tbody>
                {zichtbaar.slice(0, 500).map(r => {
                  const m = appMeta(appVanRegel(r.app));
                  return (
                    <tr key={r.ref_id}>
                      <td className="axe-cron-zacht whitespace-nowrap">{tijd(r.at)}</td>
                      <td style={{ color: m.kleur }} className="whitespace-nowrap">{m.label}</td>
                      <td className="axe-cron-zacht whitespace-nowrap">{bronWoord(r.source, r.executor ?? undefined)}</td>
                      <td className="axe-cron-naam" title={r.name}>{r.name}</td>
                      <td><span className="axe-cron-stand" data-stand={STAND[uitkomst(r.status)]}><i className="axe-cron-stip" />{statusWoord(r.status)}</span></td>
                      <td className="axe-cron-r axe-cron-zacht whitespace-nowrap">{duurTekst(r.duration_ms)}</td>
                      <td className="axe-cron-zacht max-w-[28ch] truncate" title={r.detail}>{r.detail}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {laden && <div className="axe-cron-leeg">Loading…</div>}
            {!laden && zichtbaar.length === 0 && <div className="axe-cron-leeg">{alleenFout ? 'No failures in this window.' : 'Nothing in this window for this choice.'}</div>}
            {!laden && !alleenFout && <div className="axe-cron-leeg">Successful minute crons are counted above but not listed. Latest {Math.min(zichtbaar.length, 500)} rows shown.</div>}
          </div>
        </section>
      </div>
    </motion.div>
  );
}
