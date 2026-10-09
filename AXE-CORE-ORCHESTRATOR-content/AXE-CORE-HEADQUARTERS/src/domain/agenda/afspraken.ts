/**
 * Afspraken die AXE voor Luka in de agenda zet ("boek een tafel voor vrijdag 19:30", "zet de bank in
 * mijn agenda").
 *
 * Tot 9 okt had de agenda geen eigen afspraken: alleen taken, planner-werk en cronjobs, en een lijst
 * verzonnen afspraken die bewust weg is (zie CalendarPage). AXE kon dus wel zeggen "ik plan het in" maar
 * er was nergens om het neer te zetten. Dit is dat: een lijstje van Luka's echte afspraken, met het
 * rekenwerk -- datum uit een woord ("morgen", "vrijdag"), botsingen, wat er aankomt -- los van opslag en
 * scherm, zodat het zonder netwerk te testen is.
 *
 * Een afspraak heeft een status. "gepland" is wat AXE voorstelt of heeft aangevraagd; "bevestigd" is wat
 * de zaak of Luka bevestigd heeft. AXE zet er nooit zelf "bevestigd" op omdat het een formulier heeft
 * ingevuld: een tafel is pas geboekt als de zaak ja zei.
 */
import { datumSleutel, minutenVan, type RoosterItem } from '@/domain/weekRooster';

export type AfspraakStatus = 'gepland' | 'bevestigd' | 'geannuleerd';

export interface Afspraak {
  id: string;
  titel: string;
  /** YYYY-MM-DD, lokale tijd. */
  datum: string;
  /** HH:MM, 24 uur. */
  tijd: string;
  duurMin: number;
  plaats?: string;
  notitie?: string;
  status: AfspraakStatus;
  /** Wie hem maakte: AXE of Luka zelf. */
  bron: 'axe' | 'luka';
  aangemaakt: string;
}

export interface NieuweAfspraak {
  titel: string;
  datum: string;
  tijd: string;
  duurMin?: number;
  plaats?: string;
  notitie?: string;
  status?: AfspraakStatus;
}

/** Neutraal grijs: eigen afspraken horen bij geen app en krijgen dus geen app-kleur. */
export const AFSPRAAK_KLEUR = '#94A3B8';
export const STANDAARD_DUUR_MIN = 60;

const DAGEN: ReadonlyArray<{ woorden: RegExp; dag: number }> = [
  { woorden: /^(zondag|zon|sunday|sun)$/i, dag: 0 },
  { woorden: /^(maandag|ma|monday|mon)$/i, dag: 1 },
  { woorden: /^(dinsdag|di|tuesday|tue|tues)$/i, dag: 2 },
  { woorden: /^(woensdag|wo|wednesday|wed)$/i, dag: 3 },
  { woorden: /^(donderdag|do|thursday|thu|thur|thurs)$/i, dag: 4 },
  { woorden: /^(vrijdag|vr|friday|fri)$/i, dag: 5 },
  { woorden: /^(zaterdag|za|saturday|sat)$/i, dag: 6 },
];

function metDagen(basis: Date, dagen: number): Date {
  const d = new Date(basis.getFullYear(), basis.getMonth(), basis.getDate());
  d.setDate(d.getDate() + dagen);
  return d;
}

function isEchteDatum(s: string): boolean {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (!m) return false;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return d.getFullYear() === Number(m[1]) && d.getMonth() === Number(m[2]) - 1 && d.getDate() === Number(m[3]);
}

/**
 * "2026-10-12", "vandaag", "morgen", "overmorgen", "vrijdag" of "next friday" -> YYYY-MM-DD.
 * Een weekdag is de eerstvolgende die niet vandaag is ("vrijdag" op een vrijdag is volgende week: wie
 * dat zegt bedoelt zelden vandaag, en vandaag zegt hij zelf). Onbekend geeft null in plaats van een gok.
 */
export function datumUitWoord(woord: string, nu: Date): string | null {
  const w = woord.trim().toLowerCase().replace(/^(next|volgende|aanstaande|op)\s+/, '');
  if (isEchteDatum(woord.trim())) return woord.trim();
  if (/^(vandaag|today)$/.test(w)) return datumSleutel(nu);
  if (/^(morgen|tomorrow)$/.test(w)) return datumSleutel(metDagen(nu, 1));
  if (/^(overmorgen|day after tomorrow)$/.test(w)) return datumSleutel(metDagen(nu, 2));
  const dag = DAGEN.find(d => d.woorden.test(w));
  if (!dag) return null;
  const vooruit = ((dag.dag - nu.getDay() + 7) % 7) || 7;
  return datumSleutel(metDagen(nu, vooruit));
}

/** "19:30", "7:30", "19.30" of "1930" -> "19:30"; anders null. */
export function tijdUitWoord(woord: string): string | null {
  const s = woord.trim().replace('.', ':');
  const kaal = /^(\d{1,2})(\d{2})$/.exec(s);
  const t = kaal ? `${kaal[1]}:${kaal[2]}` : s;
  const min = minutenVan(t);
  if (min === null) return null;
  return `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`;
}

export function maakAfspraak(inv: NieuweAfspraak, nu: Date): Afspraak | { fout: string } {
  const titel = inv.titel.trim().slice(0, 120);
  if (!titel) return { fout: 'An appointment needs a title.' };
  const datum = datumUitWoord(inv.datum, nu);
  if (!datum) return { fout: `I could not read the date "${inv.datum}". Use YYYY-MM-DD, or today, tomorrow or a weekday.` };
  const tijd = tijdUitWoord(inv.tijd);
  if (!tijd) return { fout: `I could not read the time "${inv.tijd}". Use HH:MM, 24 hours.` };
  const duur = inv.duurMin == null ? STANDAARD_DUUR_MIN : Math.round(inv.duurMin);
  if (!Number.isFinite(duur) || duur < 5 || duur > 24 * 60) return { fout: 'The duration must be between 5 minutes and 24 hours.' };
  return {
    id: `afspr_${nu.getTime().toString(36)}_${Math.random().toString(36).slice(2, 6)}`,
    titel, datum, tijd, duurMin: duur,
    ...(inv.plaats?.trim() ? { plaats: inv.plaats.trim().slice(0, 160) } : {}),
    ...(inv.notitie?.trim() ? { notitie: inv.notitie.trim().slice(0, 500) } : {}),
    status: inv.status ?? 'gepland',
    bron: 'axe',
    aangemaakt: nu.toISOString(),
  };
}

function bereik(a: Pick<Afspraak, 'tijd' | 'duurMin'>): [number, number] {
  const start = minutenVan(a.tijd) ?? 0;
  return [start, start + a.duurMin];
}

/** Welke bestaande afspraken overlappen met deze (zelfde dag, geannuleerde tellen niet). */
export function botsingen(lijst: readonly Afspraak[], nieuw: Pick<Afspraak, 'datum' | 'tijd' | 'duurMin' | 'id'>): Afspraak[] {
  const [s, e] = bereik(nieuw);
  return lijst.filter(a => {
    if (a.id === nieuw.id || a.status === 'geannuleerd' || a.datum !== nieuw.datum) return false;
    const [as, ae] = bereik(a);
    return s < ae && as < e;
  });
}

function sorteer(lijst: readonly Afspraak[]): Afspraak[] {
  return [...lijst].sort((a, b) => a.datum.localeCompare(b.datum) || (minutenVan(a.tijd) ?? 0) - (minutenVan(b.tijd) ?? 0));
}

/** Wat er nog aankomt: vanaf nu, binnen `dagen` dagen, zonder geannuleerde. Een afspraak van vanochtend is voorbij. */
export function komend(lijst: readonly Afspraak[], nu: Date, dagen = 14): Afspraak[] {
  const vandaag = datumSleutel(nu);
  const tot = datumSleutel(metDagen(nu, dagen));
  const nuMin = nu.getHours() * 60 + nu.getMinutes();
  return sorteer(lijst).filter(a => {
    if (a.status === 'geannuleerd' || a.datum > tot) return false;
    if (a.datum > vandaag) return true;
    return a.datum === vandaag && (bereik(a)[1] > nuMin);
  });
}

/**
 * Welke afspraak bedoelt Luka? Op id; anders op een stuk van de titel. Past de titel op meer dan één,
 * dan is het onduidelijk en geven we niets terug: iets verwijderen op een gok is erger dan vragen.
 */
export function vindAfspraak(lijst: readonly Afspraak[], wat: string): { gevonden: Afspraak } | { fout: string } {
  const q = wat.trim().toLowerCase();
  if (!q) return { fout: 'Which appointment? Give its id or part of the title.' };
  const opId = lijst.find(a => a.id.toLowerCase() === q);
  if (opId) return { gevonden: opId };
  const treffers = lijst.filter(a => a.titel.toLowerCase().includes(q));
  if (treffers.length === 1) return { gevonden: treffers[0] };
  if (treffers.length === 0) return { fout: `No appointment matches "${wat}".` };
  return { fout: `More than one matches "${wat}": ${treffers.map(a => `${a.titel} (${a.datum} ${a.tijd}, id ${a.id})`).join('; ')}. Use the id.` };
}

/** Eén afspraak als zin die AXE kan uitspreken. */
export function afspraakRegel(a: Afspraak): string {
  return [
    `${a.datum} ${a.tijd}`,
    a.titel,
    a.plaats ?? '',
    a.status === 'bevestigd' ? 'confirmed' : a.status === 'geannuleerd' ? 'cancelled' : 'not yet confirmed',
  ].filter(Boolean).join(' · ');
}

export function naarRoosterItem(a: Afspraak): RoosterItem {
  return {
    id: a.id,
    titel: a.status === 'gepland' ? `${a.titel} (unconfirmed)` : a.titel,
    datum: a.datum, tijd: a.tijd, duurMin: a.duurMin,
    kleur: AFSPRAAK_KLEUR, soort: 'appointment',
  };
}

/** Wat uit de opslag komt is niet vertrouwd: alleen wat een afspraak is, blijft. */
export function leesAfspraken(ruw: unknown): Afspraak[] {
  if (!Array.isArray(ruw)) return [];
  const uit: Afspraak[] = [];
  for (const r of ruw) {
    if (!r || typeof r !== 'object') continue;
    const a = r as Record<string, unknown>;
    if (typeof a.id !== 'string' || typeof a.titel !== 'string' || typeof a.datum !== 'string' || !isEchteDatum(a.datum)) continue;
    if (typeof a.tijd !== 'string' || minutenVan(a.tijd) === null) continue;
    const status: AfspraakStatus = a.status === 'bevestigd' || a.status === 'geannuleerd' ? a.status : 'gepland';
    uit.push({
      id: a.id, titel: a.titel.slice(0, 120), datum: a.datum, tijd: a.tijd,
      duurMin: typeof a.duurMin === 'number' && a.duurMin >= 5 ? a.duurMin : STANDAARD_DUUR_MIN,
      ...(typeof a.plaats === 'string' && a.plaats ? { plaats: a.plaats } : {}),
      ...(typeof a.notitie === 'string' && a.notitie ? { notitie: a.notitie } : {}),
      status, bron: a.bron === 'luka' ? 'luka' : 'axe',
      aangemaakt: typeof a.aangemaakt === 'string' ? a.aangemaakt : new Date(0).toISOString(),
    });
  }
  return uit;
}
