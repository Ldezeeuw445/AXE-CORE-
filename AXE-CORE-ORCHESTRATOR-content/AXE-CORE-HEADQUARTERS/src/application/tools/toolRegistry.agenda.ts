/**
 * toolRegistry.agenda.ts -- plaatsen zoeken, Luka's locatie, en zijn agenda.
 *
 * De regels staan in domain/plaatsen en domain/agenda; het ophalen in application/places/findPlaces en
 * de opslag in afsprakenService. Dit zijn de vertalingen naar een zin die het model verder kan gebruiken,
 * en bij "zoek plaatsen" ook het zetten van de kaart op Home: AXE hoeft niet te vragen of Luka het wil zien.
 */
import { TOOL_CATALOG, type ToolCatalogEntry } from '@/domain/tools/toolCatalog';
import '@/domain/tools/registerAgendaCatalog';
import {
  afspraakRegel, botsingen, komend, maakAfspraak, tijdUitWoord, datumUitWoord, vindAfspraak,
  type Afspraak, type AfspraakStatus,
} from '@/domain/agenda/afspraken';
import { plaatsRegel, formatAfstand } from '@/domain/plaatsen/plaatsen';
import { zoekPlaatsen, type ZoekResultaat } from '@/application/places/findPlaces';
import { huidigeLocatie } from '@/infrastructure/gateways/locatieService';
import { laadAfspraken, wijzigAfspraken } from '@/infrastructure/persistence/afsprakenService';
import { datumSleutel } from '@/domain/weekRooster';
import type { ProjectionPayload } from '@/domain/sphere/projectionTypes';
import { toonOpHome } from '@/application/sphere/projectionPort';

export interface AgendaToolRuntime extends ToolCatalogEntry {
  available: () => boolean;
  run: (raw: string) => Promise<string>;
  onError?: (msg: string) => string;
}

function catalogEntry(id: string): ToolCatalogEntry {
  const entry = TOOL_CATALOG.find(t => t.id === id);
  if (!entry) throw new Error(`toolRegistry.agenda: no catalog entry for '${id}'`);
  return entry;
}

/** Het model stuurt JSON; een enkel veld kan als kale tekst aankomen (zie toRawArg in nativeToolLoop). */
function leesArgs(raw: string, enigVeld: string): Record<string, unknown> {
  const t = raw.trim();
  if (t.startsWith('{')) {
    try { const p = JSON.parse(t); if (p && typeof p === 'object') return p as Record<string, unknown>; } catch { /* kale tekst */ }
  }
  return t ? { [enigVeld]: t } : {};
}

function s(v: unknown): string { return typeof v === 'string' ? v.trim() : ''; }

const STATUS: Record<string, AfspraakStatus> = {
  planned: 'gepland', pending: 'gepland', gepland: 'gepland',
  confirmed: 'bevestigd', bevestigd: 'bevestigd', booked: 'bevestigd',
  cancelled: 'geannuleerd', canceled: 'geannuleerd', geannuleerd: 'geannuleerd',
};

function plaatsProjectie(r: ZoekResultaat): ProjectionPayload {
  return {
    mode: 'map',
    title: `${r.soort} near ${r.midden.label}`.slice(0, 64),
    subtitle: `${r.plaatsen.length} found within ${formatAfstand(r.straalM)} · from ${r.midden.bron}`.slice(0, 120),
    data: {
      lat: r.midden.lat, lng: r.midden.lng, label: r.midden.label, source: 'places',
      places: r.plaatsen.map(p => ({
        id: p.id, naam: p.naam, lat: p.lat, lng: p.lng, soort: p.soort, afstandM: p.afstandM,
        adres: p.adres, telefoon: p.telefoon, website: p.website, openingstijden: p.openingstijden, keuken: p.keuken,
      })),
    },
    source: 'tool',
    id: `proj_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`,
    createdAt: Date.now(),
  };
}

export const AGENDA_TOOL_RUNTIMES: AgendaToolRuntime[] = [
  {
    ...catalogEntry('find_places'),
    available: () => true,
    run: async (raw) => {
      const a = leesArgs(raw, 'what');
      const wat = s(a.what) || s(a.query) || s(a.kind);
      if (!wat) return 'FIND_PLACES failed: say what to look for, e.g. {"what":"electronics store"}.';
      const r = await zoekPlaatsen({ wat, nabij: s(a.near) || s(a.nearby) || undefined });
      if ('fout' in r) return `FIND_PLACES: ${r.fout}`;
      if (r.plaatsen.length === 0) {
        return `FIND_PLACES: no ${r.soort} found within ${formatAfstand(r.straalM)} of ${r.midden.label} (${r.midden.bron}). Try another area or a wider description.`;
      }
      const opHome = toonOpHome(plaatsProjectie(r));
      return [
        `FIND_PLACES: ${r.plaatsen.length} ${r.soort} near ${r.midden.label} (start: ${r.midden.bron}), nearest first. ${opHome ? 'They are on Home now, with the pins on the map.' : 'Home could not show them here, so read out the best one or two instead.'}`,
        ...r.plaatsen.slice(0, 8).map((p, i) => `${i + 1}. ${plaatsRegel(p)}`),
        'Opening hours and phone come from OpenStreetMap and are missing where nobody filled them in — say that instead of guessing.',
      ].join('\n');
    },
    onError: (msg) => `FIND_PLACES failed: ${msg}. Say that the search failed; do not make up places.`,
  },
  {
    ...catalogEntry('my_location'),
    available: () => true,
    run: async () => {
      const l = await huidigeLocatie();
      const bron = l.bron === 'toestel' ? 'device location (exact)' : l.bron === 'ip' ? 'internet connection (city level only, not exact)' : 'no location available, defaulting to Amsterdam';
      return `MY_LOCATION: ${l.naam ?? `${l.lat.toFixed(4)}, ${l.lng.toFixed(4)}`} — ${bron}. lat ${l.lat.toFixed(4)}, lng ${l.lng.toFixed(4)}.`;
    },
    onError: (msg) => `MY_LOCATION failed: ${msg}`,
  },
  {
    ...catalogEntry('agenda_add'),
    available: () => true,
    run: async (raw) => {
      const a = leesArgs(raw, 'title');
      const status = STATUS[s(a.status).toLowerCase()] ?? 'gepland';
      const nu = new Date();
      const nieuw = maakAfspraak({
        titel: s(a.title) || s(a.titel), datum: s(a.date) || s(a.datum), tijd: s(a.time) || s(a.tijd),
        duurMin: typeof a.duration_min === 'number' ? a.duration_min : undefined,
        plaats: s(a.place) || s(a.plaats), notitie: s(a.note) || s(a.notitie), status,
      }, nu);
      if ('fout' in nieuw) return `AGENDA_ADD failed: ${nieuw.fout}`;
      const { uitkomst: botst, gesynct } = await wijzigAfspraken(huidig => ({
        lijst: [...huidig, nieuw], uitkomst: botsingen(huidig, nieuw),
      }));
      return [
        `AGENDA_ADD saved: ${afspraakRegel(nieuw)} (id ${nieuw.id}). It shows in the Calendar tab.`,
        botst.length ? `WARNING: this overlaps ${botst.map(afspraakRegel).join('; ')}. Tell Luka and offer another time.` : '',
        gesynct ? '' : 'It is saved on this device but has not reached the cloud yet, so other devices will not see it until it syncs.',
      ].filter(Boolean).join('\n');
    },
    onError: (msg) => `AGENDA_ADD failed: ${msg}`,
  },
  {
    ...catalogEntry('agenda_list'),
    available: () => true,
    run: async () => {
      const nu = new Date();
      const lijst = komend(await laadAfspraken(), nu, 14);
      const kop = `AGENDA_LIST: today is ${datumSleutel(nu)} (${nu.toLocaleDateString('en-GB', { weekday: 'long' })}), ${String(nu.getHours()).padStart(2, '0')}:${String(nu.getMinutes()).padStart(2, '0')}.`;
      if (!lijst.length) return `${kop} No appointments of his own in the next 14 days. (Tasks, planner work and cron jobs are separate; they are in the Calendar tab.)`;
      return [kop, ...lijst.map(x => `- ${afspraakRegel(x)} (id ${x.id}, ${x.duurMin} min)`)].join('\n');
    },
    onError: (msg) => `AGENDA_LIST failed: ${msg}`,
  },
  {
    ...catalogEntry('agenda_update'),
    available: () => true,
    run: async (raw) => {
      const a = leesArgs(raw, 'find');
      const zoek = s(a.find) || s(a.id) || s(a.title);
      const nu = new Date();
      const nieuweDatum = s(a.date) ? datumUitWoord(s(a.date), nu) : undefined;
      const nieuweTijd = s(a.time) ? tijdUitWoord(s(a.time)) : undefined;
      if (s(a.date) && !nieuweDatum) return `AGENDA_UPDATE failed: could not read the date "${s(a.date)}".`;
      if (s(a.time) && !nieuweTijd) return `AGENDA_UPDATE failed: could not read the time "${s(a.time)}".`;
      const nieuweStatus = s(a.status) ? STATUS[s(a.status).toLowerCase()] : undefined;
      if (s(a.status) && !nieuweStatus) return 'AGENDA_UPDATE failed: status must be planned, confirmed or cancelled.';
      const duur = typeof a.duration_min === 'number' ? Math.round(a.duration_min) : undefined;
      if (duur !== undefined && (duur < 5 || duur > 1440)) return 'AGENDA_UPDATE failed: the duration must be between 5 and 1440 minutes.';
      if (!nieuweDatum && !nieuweTijd && !nieuweStatus && duur === undefined && !s(a.place) && !s(a.note)) {
        return 'AGENDA_UPDATE failed: nothing to change. Give status, date, time, duration_min, place or note.';
      }
      const { uitkomst } = await wijzigAfspraken(huidig => {
        const hit = vindAfspraak(huidig, zoek);
        if ('fout' in hit) return { lijst: huidig, uitkomst: { fout: hit.fout } as { fout: string } | { na: Afspraak; botst: Afspraak[] } };
        const na: Afspraak = {
          ...hit.gevonden,
          ...(nieuweDatum ? { datum: nieuweDatum } : {}),
          ...(nieuweTijd ? { tijd: nieuweTijd } : {}),
          ...(nieuweStatus ? { status: nieuweStatus } : {}),
          ...(duur !== undefined ? { duurMin: duur } : {}),
          ...(s(a.place) ? { plaats: s(a.place) } : {}),
          ...(s(a.note) ? { notitie: s(a.note) } : {}),
        };
        return { lijst: huidig.map(x => (x.id === na.id ? na : x)), uitkomst: { na, botst: botsingen(huidig, na) } };
      });
      if ('fout' in uitkomst) return `AGENDA_UPDATE failed: ${uitkomst.fout}`;
      return [
        `AGENDA_UPDATE saved: ${afspraakRegel(uitkomst.na)} (id ${uitkomst.na.id}).`,
        uitkomst.botst.length && uitkomst.na.status !== 'geannuleerd' ? `WARNING: this overlaps ${uitkomst.botst.map(afspraakRegel).join('; ')}.` : '',
      ].filter(Boolean).join('\n');
    },
    onError: (msg) => `AGENDA_UPDATE failed: ${msg}`,
  },
];
