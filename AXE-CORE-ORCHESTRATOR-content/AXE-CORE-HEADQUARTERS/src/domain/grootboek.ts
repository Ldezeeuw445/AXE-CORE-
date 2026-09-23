/**
 * Het grootboek en de agenda van alle jobs: één beeld van wat AXE doet, per app.
 *
 * ## Waar de data vandaan komt
 *
 * De API (`/ledger`, `/calendar/jobs`) leest drie bronnen op de plek waar ze staan:
 * de runs van de eigen planner (core_job_runs), de pg_cron-jobs van Supabase
 * (Companion, AXON Memory) en de taken in core_tasks. Hier wordt niets gekopieerd,
 * alleen vertaald naar wat de schermen tonen.
 *
 * ## Eén kleur per app, overal
 *
 * Een run, een taak of een cronjob krijgt de kleur van zijn APP, dezelfde als in
 * Taken, Cron en de agenda (domain/apps.ts). Of iets gelukt is lees je aan het
 * woord ernaast, niet aan een tweede kleurensysteem.
 */
import { APPS, appMeta, isAppId, type AppId } from './apps';
import { datumSleutel, type RoosterItem } from './weekRooster';

export interface GrootboekRegel {
  at: string;
  app: string;
  source: string;
  kind: string;
  name: string;
  status: string;
  duration_ms: number | null;
  detail: string;
  ref_id: string;
  executor?: string | null;
}

export interface AgendaJob {
  key: string;
  app: string;
  naam: string;
  executor: string;
  soort: string;
  at: string;
  aantal: number;
  herhaling: string | null;
  bron: string;
}

export type AppFilter = AppId | 'alle';

export function appVanRegel(app: string): AppId {
  return isAppId(app) ? app : 'axe_core';
}

/** Een run of taak in één woord. Onbekende statussen blijven wat ze zijn. */
export function statusWoord(status: string): string {
  const woorden: Record<string, string> = {
    ok: 'gelukt', completed: 'gelukt', succeeded: 'gelukt',
    fail: 'mislukt', failed: 'mislukt', error: 'mislukt', timeout: 'time-out',
    running: 'bezig', in_progress: 'bezig', claimed: 'bezig',
    pending: 'wacht', queued: 'wacht', waiting_approval: 'wacht op akkoord',
    skipped: 'overgeslagen', cancelled: 'geannuleerd',
  };
  return woorden[status] ?? status;
}

export type Uitkomst = 'goed' | 'fout' | 'bezig' | 'open';

export function uitkomst(status: string): Uitkomst {
  if (['ok', 'completed', 'succeeded'].includes(status)) return 'goed';
  if (['fail', 'failed', 'error', 'timeout'].includes(status)) return 'fout';
  if (['running', 'in_progress', 'claimed'].includes(status)) return 'bezig';
  return 'open';
}

/** Waar het vandaan komt, zoals je het zou zeggen. */
export function bronWoord(source: string, executor?: string): string {
  const woorden: Record<string, string> = {
    schedule: executor === 'mac' ? 'job op de Mac' : 'job op de VPS',
    pg_cron: 'Supabase-cron',
    task: 'taak',
    planner: 'planner',
    launchd: 'Mac-onderhoud',
    northsea: 'NorthSea-desk',
    manual: 'handmatig',
  };
  return woorden[source] ?? source;
}

export function duurTekst(ms: number | null): string {
  if (ms === null || ms === undefined || Number.isNaN(ms)) return '';
  if (ms < 1000) return `${ms} ms`;
  const s = ms / 1000;
  if (s < 60) return `${s.toFixed(s < 10 ? 1 : 0)} s`;
  const m = Math.floor(s / 60);
  return `${m} min ${Math.round(s - m * 60)} s`;
}

export function filterRegels(regels: readonly GrootboekRegel[], app: AppFilter, bron: string | 'alle' = 'alle'): GrootboekRegel[] {
  return regels.filter(r => (app === 'alle' || appVanRegel(r.app) === app) && (bron === 'alle' || r.source === bron));
}

export interface AppStand {
  app: AppId;
  totaal: number;
  goed: number;
  fout: number;
  bezig: number;
  open: number;
  laatsteFout: GrootboekRegel | null;
}

/** Per app: hoeveel regels, hoeveel gelukt/mislukt, en de laatste fout. Altijd alle apps, ook zonder regels. */
export function standPerApp(regels: readonly GrootboekRegel[]): AppStand[] {
  const stand = new Map<AppId, AppStand>(APPS.map(a => [a.id, { app: a.id, totaal: 0, goed: 0, fout: 0, bezig: 0, open: 0, laatsteFout: null }]));
  const gesorteerd = [...regels].sort((a, b) => b.at.localeCompare(a.at));
  for (const r of gesorteerd) {
    const s = stand.get(appVanRegel(r.app))!;
    s.totaal += 1;
    const u = uitkomst(r.status);
    s[u] += 1;
    if (u === 'fout' && !s.laatsteFout) s.laatsteFout = r;
  }
  return APPS.map(a => stand.get(a.id)!);
}

/** De geplande jobs als agenda-items, in de kleur van hun app. */
export function agendaVanJobs(items: readonly AgendaJob[]): RoosterItem[] {
  const uit: RoosterItem[] = [];
  for (const i of items) {
    const d = new Date(i.at);
    if (Number.isNaN(d.getTime())) continue;
    const app = appVanRegel(i.app);
    const herhaling = i.herhaling ? ` · ${i.herhaling} (${i.aantal}×)` : '';
    uit.push({
      id: `job:${i.key}`,
      titel: `${i.naam}${herhaling}`,
      datum: datumSleutel(d),
      tijd: `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`,
      duurMin: 15,
      soort: bronWoord(i.bron === 'pg_cron' ? 'pg_cron' : 'schedule', i.executor),
      kleur: appMeta(app).kleur,
      app,
    });
  }
  return uit;
}

/** Agenda-items van één app; items zonder app (je eigen afspraken) blijven altijd staan. */
export function filterAgenda(items: readonly RoosterItem[], app: AppFilter): RoosterItem[] {
  if (app === 'alle') return [...items];
  return items.filter(i => !i.app || i.app === app);
}
