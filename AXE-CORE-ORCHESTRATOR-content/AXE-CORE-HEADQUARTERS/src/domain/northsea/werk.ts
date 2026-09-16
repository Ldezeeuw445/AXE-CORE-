/**
 * Het werk van de NorthSea-desk, in de vorm die de Taken- en Agenda-tab lezen.
 *
 * ## Waarom dit vertaald moet worden
 *
 * De vijf apps groeperen op `metadata.app` in core_tasks (domain/apps.ts). De
 * desk schrijft daar niet: zijn taken staan in deal_tasks en action_queue van
 * AXE Commodities, en zijn geplande acties in next_action_at. De NorthSea-kolom
 * stond daardoor leeg terwijl er 87 open taken lagen -- het ergste soort leeg,
 * want het ziet eruit als "niets te doen".
 *
 * ## Eén kleur per app, ook hier
 *
 * Deze items krijgen de kleur van NorthSea, net als alles van die app. De SOORT
 * (deal task, action queue, next action, campagne) staat in de tekst. Zo blijft
 * er één kleursysteem: de app kleurt, het soort staat er in woorden bij.
 *
 * ## Prioriteit is hier een getal
 *
 * AXE Commodities zet er 0-100 op, de takenlijst kent vier banden. Onbekend
 * wordt 'medium' en niet 'low': iets zonder cijfer stilletjes onderaan leggen
 * is een keuze die niemand gemaakt heeft.
 */
import { appMeta } from '../apps';
import { datumSleutel, type RoosterItem } from '../weekRooster';
import type { NorthseaAgendaItem, NorthseaTaak } from './tabs/typen';

export type Prioriteit = 'low' | 'medium' | 'high' | 'critical';
export type Stand = 'todo' | 'in-progress' | 'done' | 'blocked';

export interface WerkTaak {
  id: string;
  titel: string;
  van: string;
  prioriteit: Prioriteit;
  deadline?: number;
  voortgang: number;
  klaar: boolean;
  stand: Stand;
}

/** Het voorvoegsel waaraan de Taken-tab ziet dat een rij van de desk komt. */
export const NS_PREFIX = 'ns:';

export function isNorthseaWerk(id: string): boolean {
  return id.startsWith(NS_PREFIX);
}

export function prioriteitVan(n: unknown): Prioriteit {
  const g = typeof n === 'number' ? n : typeof n === 'string' ? Number(n) : NaN;
  if (!Number.isFinite(g)) return 'medium';
  if (g >= 75) return 'critical';
  if (g >= 50) return 'high';
  if (g >= 25) return 'medium';
  return 'low';
}

const STAND: Record<string, Stand> = {
  open: 'todo',
  in_progress: 'in-progress',
  waiting: 'blocked',
};

const BRON_LABEL: Record<string, string> = {
  deal_task: 'Deal task',
  action_queue: 'Action queue',
};

const tijdVan = (iso: unknown): number | undefined => {
  if (typeof iso !== 'string') return undefined;
  const ms = Date.parse(iso);
  return Number.isNaN(ms) ? undefined : ms;
};

/** De open taken van de desk, voor de NorthSea-kolom in de Taken-tab. */
export function northseaTaken(taken: readonly NorthseaTaak[]): WerkTaak[] {
  return taken.map(t => {
    const bron = BRON_LABEL[String(t.bron)] ?? 'NorthSea';
    return {
      id: `${NS_PREFIX}${t.id}`,
      titel: (t.titel ?? '').trim() || 'Untitled task',
      van: t.deal_code ? `${bron} · ${t.deal_code}` : bron,
      prioriteit: prioriteitVan(t.prioriteit),
      deadline: tijdVan(t.due_at),
      voortgang: 0,
      klaar: false,
      stand: STAND[String(t.status)] ?? 'todo',
    };
  });
}

const klok = (d: Date) => `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;

/** De geplande acties van de desk, voor de agenda. */
export function northseaAgenda(items: readonly NorthseaAgendaItem[]): RoosterItem[] {
  const kleur = appMeta('northsea').kleur;
  const uit: RoosterItem[] = [];
  for (const i of items) {
    if (typeof i.wanneer !== 'string') continue;
    const d = new Date(i.wanneer);
    if (Number.isNaN(d.getTime())) continue;
    const soort = i.soort === 'campagne' ? 'campagne' : 'next action';
    const titel = (i.titel ?? '').trim() || (i.soort === 'campagne' ? 'Sourcing campaign' : 'Next action');
    uit.push({
      id: `${NS_PREFIX}${i.id}`,
      titel: i.deal_code ? `${i.deal_code} · ${titel}` : titel,
      datum: datumSleutel(d),
      tijd: klok(d),
      duurMin: 30,
      soort,
      kleur,
    });
  }
  return uit;
}
