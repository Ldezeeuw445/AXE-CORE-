/**
 * Het werk van AXE als agenda: wat er wanneer gebeurt, en voor welke app.
 *
 * ## Waarom
 *
 * Taken, de planner en de cronjobs stonden elk op hun eigen tab, elk met hun
 * eigen kleuren. De agenda was leeg ("er is geen agendakoppeling"). Luka wil
 * één beeld: wat, waar en wanneer -- een lopend bedrijf dat je kunt aflezen.
 *
 * ## Eén kleur per app, overal
 *
 * De kleur van een item is de kleur van zijn APP (domain/apps.ts), niet van
 * zijn soort. Dezelfde cyaan voor AXE Core in Taken, in Cron en hier. De soort
 * (taak, planner, cronjob) staat in de tekst, want twee kleursystemen door
 * elkaar is precies wat je niet meer kunt lezen.
 *
 * ## Wat wanneer staat
 *
 *   - een taak met een deadline (metadata.dueAt): op die deadline;
 *   - een planner-taak: op het moment dat hij gepland is, of afgerond als hij
 *     klaar is -- zo zie je in de week wat de agents zelf deden;
 *   - een cronjob die aan staat: op zijn volgende run.
 *
 * Een taak zonder deadline staat er niet in: een agenda zonder tijd is een
 * lijst, en die lijst is de Taken-tab al.
 */
import { appMeta, appVan } from './apps';
import { datumSleutel, type RoosterItem } from './weekRooster';

export interface AgendaTaak {
  id: string;
  title: string;
  status: string;
  created_at: string;
  completed_at?: string | null;
  metadata?: Record<string, unknown> | null;
  /** Kwam hij van de planner (capability 'planner')? */
  planner?: boolean;
}

export interface AgendaCron {
  id: string;
  name: string;
  enabled: boolean;
  next_run_at: string | null;
  metadata?: Record<string, unknown> | null;
}

function tijdVan(d: Date): string {
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

function item(id: string, titel: string, wanneer: string | null | undefined, duurMin: number,
  soort: string, metadata: Record<string, unknown> | null | undefined): RoosterItem | null {
  if (!wanneer) return null;
  const d = new Date(wanneer);
  if (Number.isNaN(d.getTime())) return null;
  return { id, titel, datum: datumSleutel(d), tijd: tijdVan(d), duurMin, soort, kleur: appMeta(appVan(metadata)).kleur };
}

export function werkAgenda(taken: readonly AgendaTaak[], crons: readonly AgendaCron[]): RoosterItem[] {
  const uit: RoosterItem[] = [];
  const gezien = new Set<string>();
  for (const t of taken) {
    if (gezien.has(t.id)) continue;
    gezien.add(t.id);
    const meta = t.metadata ?? {};
    if (t.planner || meta.planner === true) {
      const klaar = t.status === 'completed' && t.completed_at;
      const i = item(`planner:${t.id}`, `${klaar ? '✓ ' : ''}Planner · ${t.title}`,
        klaar ? t.completed_at : t.created_at, 30, 'planner', meta);
      if (i) uit.push(i);
      continue;
    }
    const due = typeof meta.dueAt === 'string' ? meta.dueAt : null;
    const i = item(`taak:${t.id}`, `${t.status === 'completed' ? '✓ ' : ''}${t.title}`, due, 30, 'taak', meta);
    if (i) uit.push(i);
  }
  for (const c of crons) {
    if (!c.enabled) continue;
    const i = item(`cron:${c.id}`, `Cron · ${c.name}`, c.next_run_at, 15, 'cronjob', c.metadata);
    if (i) uit.push(i);
  }
  return uit.sort((a, b) => (a.datum + a.tijd).localeCompare(b.datum + b.tijd));
}
