/**
 * Het 3D-vak in rust (Luka 26 nov, fase 1): alleen tegels die NU aandacht vragen.
 *
 * Geen eigen data. HomeLiveDashboard haalt alles al op voor de kaarten rond de
 * bol; hij geeft het hier doorheen en het vak toont het. Speelt er niks, dan
 * geeft dit een lege lijst en blijft het vak rustig. Een tegel gaat bij een
 * klik naar de plek waar je het oplost. Puur: geen I/O, geen klok.
 */

export type AandachtSoort = 'storing' | 'apps' | 'wacht' | 'northsea' | 'afspraak' | 'posities' | 'agents';
export type AandachtToon = 'fout' | 'let-op' | 'info';

export interface AandachtTegel {
  id: AandachtSoort;
  titel: string;
  regel: string;
  route: string;
  toon: AandachtToon;
  /** Fase 2: wat de tegel laat zien als hij uitgroeit (max DETAIL_MAX regels). */
  details: string[];
}

export interface AandachtInvoer {
  /** Agents die nu werken, met wat ze doen (eerste paar). */
  werkend: number;
  werkTitels: readonly string[];
  /** Alles wat op jouw ok wacht (AXE + elders), met een paar titels. */
  wacht: number;
  wachtTitels: readonly string[];
  /** NorthSea-concepten die op jouw goedkeuring wachten (null = niet geladen). */
  concepten: readonly string[] | null;
  /** Volgende eenmalige afspraak vandaag. */
  afspraak: { tijd: string; titel: string; minutenTot: number } | null;
  /** Diensten die down zijn, toestellen die vandaag gezien zijn maar nu offline. */
  dienstenDown: readonly string[];
  toestellenOffline: readonly string[];
  /** De VPS antwoordt niet (snapshot faalt zonder data). */
  vpsWeg: boolean;
  /** Fase 2: apps die falen of waarschuwen ("Trading OS: Failing · Review Desk ×15"). */
  appsMis?: readonly string[];
  /** Fase 2: open posities, alleen lezen ("EURUSD long · Demo 1"). */
  posities?: readonly string[];
}

/** Een afspraak is pas aandacht als hij binnen dit venster valt. */
export const AFSPRAAK_VENSTER_MIN = 120;
export const MAX_TEGELS = 6;
export const DETAIL_MAX = 6;

function details(namen: readonly string[]): string[] {
  return namen.map(schoon).filter(Boolean).slice(0, DETAIL_MAX);
}

/** "Dit is: een shell-commando" -> "een shell-commando": de kop zegt het al. */
function schoon(n: string): string {
  return n.replace(/^\s*(?:dit is|this is)\s*:\s*/i, '').replace(/\s+/g, ' ').trim();
}

function lijst(namen: readonly string[], max = 2): string {
  const kort = namen.map(schoon).filter(Boolean).slice(0, max).map((n) => (n.length > 48 ? `${n.slice(0, 47)}…` : n));
  const rest = namen.length - kort.length;
  return kort.join(' · ') + (rest > 0 ? ` · +${rest}` : '');
}

function tal(n: number, een: string, meer: string): string {
  return `${n} ${n === 1 ? een : meer}`;
}

export function aandachtTegels(i: AandachtInvoer): AandachtTegel[] {
  const t: AandachtTegel[] = [];

  if (i.vpsWeg || i.dienstenDown.length || i.toestellenOffline.length) {
    const delen = [
      ...(i.vpsWeg ? ['VPS not answering'] : []),
      ...i.dienstenDown.map((d) => `${d} down`),
      ...i.toestellenOffline.map((d) => `${d} offline`),
    ];
    const hard = i.vpsWeg || i.dienstenDown.length > 0;
    t.push({
      id: 'storing',
      titel: hard ? 'Something is down' : tal(i.toestellenOffline.length, 'device offline', 'devices offline'),
      regel: lijst(delen, 3),
      route: hard ? '/apps' : '/devices',
      toon: hard ? 'fout' : 'let-op',
      details: details(delen),
    });
  }

  if (i.appsMis && i.appsMis.length) {
    t.push({
      id: 'apps',
      titel: tal(i.appsMis.length, 'app needs a look', 'apps need a look'),
      regel: lijst(i.appsMis),
      route: '/apps',
      toon: 'let-op',
      details: details(i.appsMis),
    });
  }

  if (i.wacht > 0) {
    t.push({
      id: 'wacht',
      titel: `${i.wacht} waiting for your OK`,
      regel: lijst(i.wachtTitels) || 'Open Waiting on you',
      route: '/wacht',
      toon: 'let-op',
      details: (() => {
        const d = details(i.wachtTitels);
        if (i.wacht <= d.length) return d;
        const getoond = d.slice(0, DETAIL_MAX - 1);
        return [...getoond, `+${i.wacht - getoond.length} more in Waiting on you`];
      })(),
    });
  }

  if (i.concepten && i.concepten.length > 0) {
    t.push({
      id: 'northsea',
      titel: tal(i.concepten.length, 'NorthSea draft to approve', 'NorthSea drafts to approve'),
      regel: lijst(i.concepten),
      route: '/northsea',
      toon: 'let-op',
      details: details(i.concepten),
    });
  }

  if (i.afspraak && i.afspraak.minutenTot >= 0 && i.afspraak.minutenTot <= AFSPRAAK_VENSTER_MIN) {
    const m = i.afspraak.minutenTot;
    t.push({
      id: 'afspraak',
      titel: m < 1 ? 'Now' : m < 60 ? `In ${m} min` : `At ${i.afspraak.tijd}`,
      regel: i.afspraak.titel,
      route: '/calendar',
      toon: m <= 15 ? 'let-op' : 'info',
      details: [`${i.afspraak.tijd} · ${i.afspraak.titel}`],
    });
  }

  if (i.posities && i.posities.length) {
    t.push({
      id: 'posities',
      titel: tal(i.posities.length, 'open position', 'open positions'),
      regel: lijst(i.posities),
      route: '/trading',
      toon: 'info',
      details: details(i.posities),
    });
  }

  if (i.werkend > 0) {
    t.push({
      id: 'agents',
      titel: tal(i.werkend, 'agent working', 'agents working'),
      regel: lijst(i.werkTitels) || 'Open Managers',
      route: '/managers',
      toon: 'info',
      details: details(i.werkTitels),
    });
  }

  return t.slice(0, MAX_TEGELS);
}

/** Stabiele sleutel: alleen opnieuw tekenen als er echt iets veranderde. */
export function aandachtSleutel(t: readonly AandachtTegel[], strook: string | null = null): string {
  return `${strook ?? ''}\n${t.map((x) => `${x.id}|${x.titel}|${x.regel}|${x.toon}|${x.details.join('~')}`).join('\n')}`;
}

/** Tegels opzij zolang AXE iets op het toneel zet (antwoord of projectie). */
export function tegelsZichtbaar(heeftHoofdkaart: boolean, aantal: number): boolean {
  return !heeftHoofdkaart && aantal > 0;
}

/** Zolang blijft een antwoord op het toneel nadat AXE klaar is met praten. */
export const ANTWOORD_RUST_MS = 60_000;

/**
 * Staat het laatste antwoord nog op het toneel? Ja zolang AXE denkt of praat,
 * en daarna nog ANTWOORD_RUST_MS. Weggeklikt (weggelegdTs = dat antwoord) is weg.
 * Daarna komen de aandachtstegels terug.
 */
export function antwoordBlijft(i: {
  voiceStatus: string;
  laatsteAxeTs: number | null;
  nu: number;
  weggelegdTs?: number | null;
  rustMs?: number;
}): boolean {
  if (i.voiceStatus === 'processing' || i.voiceStatus === 'speaking') return true;
  if (i.laatsteAxeTs == null) return true;
  if (i.weggelegdTs != null && i.weggelegdTs >= i.laatsteAxeTs) return false;
  return i.nu - i.laatsteAxeTs < (i.rustMs ?? ANTWOORD_RUST_MS);
}

/** Waar een tegel naartoe gaat, in het "Open ..."-knopje van de uitgegroeide tegel. */
export const PLEK: Record<AandachtSoort, string> = {
  storing: 'Apps', apps: 'Apps', wacht: 'Waiting on you', northsea: 'NorthSea',
  afspraak: 'Calendar', posities: 'Trading', agents: 'Managers',
};

/**
 * Welke tegels nu in beeld: in rust alles; tijdens een antwoord of projectie
 * alleen de vastgezette (fase 2). Een vastgezette tegel zonder aandacht
 * verschijnt niet: vastzetten bewaart een plek, geen nepdata.
 */
export function zichtbareTegels(tegels: readonly AandachtTegel[], vast: ReadonlySet<string>, heeftHoofdkaart: boolean): AandachtTegel[] {
  return heeftHoofdkaart ? tegels.filter((t) => vast.has(t.id)) : [...tegels];
}

/** Compacte strook voor vandaag, of null als er niets gemeten is. */
export function vandaagStrook(i: {
  klaar: number | null;
  mislukt: number | null;
  volgende: readonly { tijd: string; titel: string }[];
}): string | null {
  const delen: string[] = [];
  if (i.klaar != null) delen.push(`${i.klaar} done`);
  if (i.mislukt) delen.push(`${i.mislukt} failed`);
  const v = i.volgende.slice(0, 2).map((x) => `${x.tijd} ${x.titel.length > 28 ? `${x.titel.slice(0, 27)}…` : x.titel}`);
  if (v.length) delen.push(`next ${v.join(', ')}`);
  return delen.length ? `Today · ${delen.join(' · ')}` : null;
}
