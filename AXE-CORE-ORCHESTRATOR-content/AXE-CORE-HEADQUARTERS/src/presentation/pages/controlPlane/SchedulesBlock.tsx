/**
 * Elke geplande job, van elke app, met zijn laatste run, zijn volgende run en
 * -- waar dat echt kan -- een "Run now" met bevestiging.
 *
 * Wat kan:
 *   - planner-jobs op de VPS: POST /cron/schedules/{id}/run, synchroon; de
 *     uitkomst komt direct terug.
 *   - jobs in het ops-register (Companion): POST /cron/jobs/{app}/{name}/run.
 *     Die vuurt asynchroon via pg_net (202); we kijken daarna in /cron/runs
 *     tot de run er staat, en tonen díe uitkomst.
 * Wat niet kan staat erbij, met de reden (Mac-jobs, observed jobs, losse
 * pg_cron-jobs).
 */
import { useMemo, useState } from 'react';
import { appMeta, type AppId } from '@/domain/apps';
import { korteDuur, scheduleStand, sorteerSchedules, type ScheduleRow, type ScheduleStand } from '@/domain/controlPlane';
import { cronRunNow, opsCronRunNow, opsCronRuns } from '@/infrastructure/gateways/axeCoreApiService';
import { Bevestig, Stand, type Toon } from './bits';
import type { Peiling, ScheduleData } from './useControlPlaneData';

const STAND: Record<ScheduleStand, { toon: Toon; woord: string }> = {
  failing: { toon: 'bad', woord: 'failing' },
  overdue: { toon: 'warn', woord: 'overdue' },
  unknown: { toon: 'muted', woord: 'no result yet' },
  ok: { toon: 'ok', woord: 'ok' },
  off: { toon: 'muted', woord: 'off' },
};

const RUNNER: Record<ScheduleRow['runner'], string> = { vps: 'VPS', mac: 'Mac', supabase: 'Supabase', unknown: 'unknown' };

type Uitkomst = { toon: Toon; tekst: string };

const wacht = (ms: number) => new Promise(r => setTimeout(r, ms));

/** Na een 202: kijk in /cron/runs tot de handmatige run er staat (max. 90 s). */
async function wachtOpRun(app: string, name: string, sinds: number): Promise<Uitkomst> {
  for (let i = 0; i < 9; i += 1) {
    await wacht(10_000);
    const runs = await opsCronRuns(app, name, 3).catch(() => []);
    const run = runs.find(r => Date.parse(r.started_at) >= sinds - 5_000);
    if (run) {
      const code = run.status_code != null ? `HTTP ${run.status_code}` : 'no HTTP status';
      const duur = run.duration_ms != null ? ` in ${run.duration_ms} ms` : '';
      return run.ok
        ? { toon: 'ok', tekst: `Ran: ${code}${duur}` }
        : { toon: 'bad', tekst: `Failed: ${code}${duur}${run.error ? ` · ${run.error}` : ''}` };
    }
  }
  return { toon: 'warn', tekst: 'Dispatched, but no run in /cron/runs after 90 s.' };
}

export function SchedulesBlock({ peiling, now }: { peiling: Peiling<ScheduleData>; now: number }) {
  const [app, setApp] = useState<AppId | 'all'>('all');
  const [uitkomst, setUitkomst] = useState<Record<string, Uitkomst>>({});
  const rows = useMemo(() => sorteerSchedules(peiling.data?.rows ?? [], now), [peiling.data, now]);
  const apps = useMemo(() => [...new Set(rows.map(r => r.app))], [rows]);
  const zichtbaar = app === 'all' ? rows : rows.filter(r => r.app === app);

  const zet = (key: string, u: Uitkomst) => setUitkomst(s => ({ ...s, [key]: u }));

  const draai = async (r: ScheduleRow) => {
    if (!r.runVia) return;
    try {
      if (r.runVia.kind === 'planner') {
        const { result } = await cronRunNow(r.runVia.id);
        const ok = result.status === 'ok';
        zet(r.key, { toon: ok ? 'ok' : 'bad', tekst: `${ok ? 'Ran' : `Result: ${result.status}`}${result.output ? ` · ${result.output.slice(0, 140)}` : ''}` });
        peiling.refresh();
        return;
      }
      const { app: opsApp, name } = r.runVia;
      const sinds = Date.now();
      const res = await opsCronRunNow(opsApp, name);
      zet(r.key, { toon: 'info', tekst: `Dispatched${res.request_id != null ? ` (request ${res.request_id})` : ''}. Waiting for the result…` });
      // De knop komt vrij zodra de job verstuurd is; de uitkomst volgt in de regel.
      void wachtOpRun(opsApp, name, sinds).then(u => { zet(r.key, u); peiling.refresh(); });
    } catch (e) {
      zet(r.key, { toon: 'bad', tekst: e instanceof Error ? e.message : String(e) });
    }
  };

  if (!peiling.data) {
    return <p className="text-xs" style={{ color: peiling.error ? 'var(--m-broken)' : 'var(--text-muted)' }}>{peiling.error ?? 'Loading schedules…'}</p>;
  }

  return (
    <div>
      <div className="mb-2 flex flex-wrap items-center gap-1">
        <button type="button" className="cp-keuze" data-aan={app === 'all' ? 'ja' : undefined} onClick={() => setApp('all')}>All {rows.length}</button>
        {apps.map(a => (
          <button key={a} type="button" className="cp-keuze" data-aan={app === a ? 'ja' : undefined} onClick={() => setApp(a)}>
            <span style={{ color: app === a ? undefined : appMeta(a).kleur }}>{appMeta(a).label}</span> {rows.filter(r => r.app === a).length}
          </button>
        ))}
      </div>
      {peiling.data.gaps.map(g => <p key={g} className="mb-1 text-[11px]" style={{ color: 'var(--m-budget)' }}>Not readable: {g}</p>)}
      <table className="cp-tabel">
        <thead>
          <tr>
            <th>App</th><th>Job</th><th>Runs on</th><th>Schedule</th><th>State</th><th>Last run</th>
            <th className="cp-r">Failures</th><th>Next run</th><th className="cp-r">Action</th>
          </tr>
        </thead>
        <tbody>
          {zichtbaar.map(r => {
            const s = STAND[scheduleStand(r, now)];
            const m = appMeta(r.app);
            const u = uitkomst[r.key];
            const volgend = r.nextRunAt ? Date.parse(r.nextRunAt) : null;
            return (
              <tr key={r.key} data-uit={r.enabled ? undefined : 'ja'}>
                <td className="whitespace-nowrap" style={{ color: m.kleur }}>{m.label}</td>
                <td>
                  <div className="cp-naam">{r.name}</div>
                  {r.description && <div className="cp-zacht cp-mono text-[10.5px]">{r.description}</div>}
                  {u && <div className="mt-0.5 text-[11px]"><Stand toon={u.toon}>{u.tekst}</Stand></div>}
                </td>
                <td className="whitespace-nowrap">{RUNNER[r.runner]}<span className="cp-zacht"> · {r.source === 'planner' ? 'AXE planner' : 'pg_cron'}</span></td>
                <td className="cp-mono cp-zacht whitespace-nowrap">{r.cron}</td>
                <td><Stand toon={s.toon} title={r.lastDetail ?? undefined}>{s.woord}</Stand></td>
                <td className="whitespace-nowrap">
                  {r.lastRunAt ? <>{korteDuur(r.lastRunAt, now)} ago</> : <span className="cp-zacht">unknown</span>}
                  {r.lastDetail && r.lastOk === false && <div className="text-[10.5px]" style={{ color: 'var(--m-broken)' }}>{r.lastDetail}</div>}
                </td>
                <td className="cp-r whitespace-nowrap">
                  {r.failures == null ? <span className="cp-zacht">—</span>
                    : <span style={{ color: r.failures > 0 ? 'var(--m-broken)' : 'var(--text-muted)' }}>{r.failures} <span className="cp-zacht">{r.failuresScope}</span></span>}
                </td>
                <td className="whitespace-nowrap">
                  {volgend == null ? <span className="cp-zacht">{r.enabled ? 'unknown' : 'off'}</span>
                    : volgend < now ? <span style={{ color: 'var(--m-budget)' }}>{korteDuur(r.nextRunAt, now)} late</span>
                      : <>in {korteDuur(r.nextRunAt, now)}</>}
                </td>
                <td className="cp-r">
                  {r.runVia
                    ? <Bevestig label="Run now" vraag={`Run ${r.name} now?`} doe={() => draai(r)} />
                    : <span className="cp-zacht whitespace-nowrap text-[10.5px]" title={r.runBlocked?.lang}>read-only · {r.runBlocked?.kort}</span>}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {zichtbaar.length === 0 && <p className="py-4 text-xs" style={{ color: 'var(--text-muted)' }}>No scheduled jobs.</p>}
    </div>
  );
}
