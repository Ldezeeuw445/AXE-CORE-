/**
 * Peeks en Home in de AXE-notch (Luka, 18 nov 2026 -- uit de Pulsar-notch,
 * in AXE's eigen vorm). Puur, geen I/O.
 *
 * Peek: is de notch dicht en gebeurt er iets dat Luka wil weten, dan zakt er
 * een paar seconden één regel onder de balk uit en trekt zich weer terug.
 * Geen focus, geen geluid, niets aanklikken nodig. Klik = naar die plek.
 *
 * Home: wat er nú speelt in één blik, zodat de Home-knop niet meer meteen
 * het hoofdvenster naar voren trekt (dat is nu een knop ín Home).
 */

export type PeekTab = 'approvals' | 'claude' | 'chat' | 'home';
export type PeekSoort = 'goedkeuring' | 'claude-klaar' | 'claude-wacht' | 'taak-klaar' | 'portal';

export interface Peek {
  id: string;
  soort: PeekSoort;
  titel: string;
  tekst: string;
  tab: PeekTab;
  /** Portal: het gelande bestand; klik = laat zien in Finder. */
  pad?: string;
}

/** Wat de notch elke tik weet; genoeg om verschil te zien. */
export interface NotchMoment {
  goedkeuringen: Array<{ id: string; titel: string }>;
  claude: { sessieId: string; toestand: 'bezig' | 'wacht' | 'klaar'; project: string; vraag: string; nu: string; toestemming: boolean } | null;
  taken: string[];
}

/** Hoe lang één peek blijft staan. */
export const PEEK_MS = 5000;
/** Meer dan dit in de rij is ruis: de oudste vallen eraf. */
export const PEEK_RIJ_MAX = 3;

function kort(s: string, n = 80): string {
  const t = s.replace(/\s+/g, ' ').trim();
  return t.length <= n ? t : `${t.slice(0, n - 1)}…`;
}

/** De taaknaam zonder " · running". */
function taakNaam(regel: string): string {
  return regel.replace(/\s·\s[^·]*$/, '').trim();
}

/**
 * Welke peeks horen bij de overgang van `vorig` naar `nu`. Eerste meting
 * (vorig = null) geeft niets: bij opstarten is alles "nieuw", en dat is het niet.
 */
export function nieuwePeeks(vorig: NotchMoment | null, nu: NotchMoment): Peek[] {
  if (!vorig) return [];
  const uit: Peek[] = [];

  const oud = new Set(vorig.goedkeuringen.map((g) => g.id));
  const nieuw = nu.goedkeuringen.filter((g) => !oud.has(g.id));
  if (nieuw.length === 1) {
    uit.push({ id: `g-${nieuw[0].id}`, soort: 'goedkeuring', titel: 'Wacht op jou', tekst: kort(nieuw[0].titel), tab: 'approvals' });
  } else if (nieuw.length > 1) {
    uit.push({ id: `g-${nieuw.map((g) => g.id).join('-')}`, soort: 'goedkeuring', titel: 'Wacht op jou',
      tekst: `${nieuw.length} nieuwe goedkeuringen`, tab: 'approvals' });
  }

  const vc = vorig.claude;
  const nc = nu.claude;
  if (nc && vc && nc.sessieId === vc.sessieId && nc.toestand !== vc.toestand) {
    if (nc.toestand === 'klaar') {
      uit.push({ id: `ck-${nc.sessieId}-${nc.vraag}`, soort: 'claude-klaar', titel: `Claude klaar${nc.project ? ` · ${nc.project}` : ''}`,
        tekst: kort(nc.vraag || 'Jouw beurt'), tab: 'claude' });
    } else if (nc.toestand === 'wacht' && !nc.toestemming) {
      // Een toestemmingsvraag opent de notch al zelf; dit is de rest ("wacht op invoer").
      uit.push({ id: `cw-${nc.sessieId}-${nc.nu}`, soort: 'claude-wacht', titel: 'Claude wacht op jou', tekst: kort(nc.nu), tab: 'claude' });
    }
  }

  const nogBezig = new Set(nu.taken.map(taakNaam));
  for (const regel of vorig.taken) {
    const naam = taakNaam(regel);
    if (naam && !nogBezig.has(naam)) {
      uit.push({ id: `t-${naam}`, soort: 'taak-klaar', titel: 'Afgerond', tekst: kort(naam), tab: 'home' });
    }
  }
  return uit;
}

/** Nieuwe peeks achter de rij; dubbele id's niet twee keer, en nooit langer dan PEEK_RIJ_MAX. */
export function zetInRij(rij: Peek[], erbij: Peek[]): Peek[] {
  const ids = new Set(rij.map((p) => p.id));
  const samen = [...rij, ...erbij.filter((p) => !ids.has(p.id))];
  return samen.slice(-PEEK_RIJ_MAX);
}

// ── Home ────────────────────────────────────────────────────────────────

export interface HomeRegel {
  sleutel: 'wacht' | 'claude' | 'taken' | 'volgende';
  label: string;
  tekst: string;
  /** Gedempt: er is niets te doen. */
  rustig: boolean;
  tab?: PeekTab;
}

export interface HomeStand {
  groet: string;
  datum: string;
  regels: HomeRegel[];
}

const DAGEN = ['zondag', 'maandag', 'dinsdag', 'woensdag', 'donderdag', 'vrijdag', 'zaterdag'];
const MAANDEN = ['januari', 'februari', 'maart', 'april', 'mei', 'juni', 'juli', 'augustus', 'september', 'oktober', 'november', 'december'];

export function groetVoor(uur: number): string {
  if (uur < 6) return 'Goedenacht';
  if (uur < 12) return 'Goedemorgen';
  if (uur < 18) return 'Goedemiddag';
  return 'Goedenavond';
}

function tijd(d: Date): string {
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

export function homeStand(nu: Date, m: NotchMoment, volgende: { naam: string; at: string } | null, bereikbaar = true): HomeStand {
  const regels: HomeRegel[] = [];
  const n = m.goedkeuringen.length;
  // Geen verbinding: "niets wacht" zou een leugen kunnen zijn (zelfde regel als de bol).
  regels.push(!bereikbaar && !n
    ? { sleutel: 'wacht', label: 'Wacht op jou', tekst: 'Onbekend — geen verbinding met AXE', rustig: false }
    : n
    ? { sleutel: 'wacht', label: 'Wacht op jou', tekst: n === 1 ? kort(m.goedkeuringen[0].titel, 60) : `${n} goedkeuringen`, rustig: false, tab: 'approvals' }
    : { sleutel: 'wacht', label: 'Wacht op jou', tekst: 'Niets — alles loopt', rustig: true });
  regels.push(m.claude
    ? { sleutel: 'claude', label: 'Claude', tekst: kort(`${m.claude.nu}${m.claude.project ? ` · ${m.claude.project}` : ''}`, 60),
        rustig: m.claude.toestand === 'klaar', tab: 'claude' }
    : { sleutel: 'claude', label: 'Claude', tekst: 'Geen sessie', rustig: true });
  regels.push(m.taken.length
    ? { sleutel: 'taken', label: 'Managers', tekst: `${m.taken.length} bezig · ${kort(taakNaam(m.taken[0]), 44)}`, rustig: false }
    : { sleutel: 'taken', label: 'Managers', tekst: 'Niemand bezig', rustig: true });
  if (volgende) {
    const at = new Date(volgende.at);
    const zelfdeDag = at.toDateString() === nu.toDateString();
    regels.push({ sleutel: 'volgende', label: 'Volgende', tekst: kort(`${zelfdeDag ? '' : 'morgen '}${tijd(at)} · ${volgende.naam}`, 60), rustig: true });
  }
  return {
    groet: groetVoor(nu.getHours()),
    datum: `${DAGEN[nu.getDay()]} ${nu.getDate()} ${MAANDEN[nu.getMonth()]} · ${tijd(nu)}`,
    regels,
  };
}

/** Het eerstvolgende agenda-item na `nu` (gesorteerd op tijd), of null. */
export function eerstvolgende<T extends { naam: string; at: string }>(items: T[], nu: Date): T | null {
  const t = nu.getTime();
  return [...items].filter((i) => new Date(i.at).getTime() > t).sort((a, b) => a.at.localeCompare(b.at))[0] ?? null;
}

/**
 * Zacht geluid (22 nov, BOUWLIJST): bij een vraag en bij "klaar", één toon per
 * keer. Een vraag wint van klaar: als beide tegelijk binnenkomen moet je weten
 * dat er iets op je wacht. Alleen op de Mac waar Luka net iets deed (stil <
 * GELUID_STIL_S), zodat iMac en Mac mini niet tegelijk piepen.
 */
export type NotchGeluid = 'vraag' | 'klaar';
export const GELUID_STIL_S = 120;

export function geluidVoor(peeks: Peek[], stilSeconden: number | null, aan: boolean): NotchGeluid | null {
  if (!aan || peeks.length === 0) return null;
  if (stilSeconden !== null && stilSeconden > GELUID_STIL_S) return null;
  if (peeks.some((p) => p.soort === 'claude-wacht' || p.soort === 'goedkeuring')) return 'vraag';
  if (peeks.some((p) => p.soort === 'claude-klaar' || p.soort === 'taak-klaar')) return 'klaar';
  return null;
}

/**
 * Goedkeuren zonder uitklappen (22 nov, Luka: "dingen goedkeuren in de notch
 * zonder hem helemaal groot uit te hoeven klappen"). Zolang er iets op Luka
 * wacht en de notch dicht is, staat onder de balk één vaste strook met de
 * bovenste goedkeuring (zoals in de Approvals-tab) en Approve / Reject. Een lopende peek gaat even voor (5 s),
 * daarna komt de strook terug. Trade/betaling: alleen "Open", nooit hier ja.
 */
export interface OkStrook {
  id: string;
  titel: string;
  tekst: string;
  meer: number;
  gevaarlijk: boolean;
}

export function kiesOkStrook(
  goedkeuringen: Array<{ id: string; titel: string; detail?: string; gevaarlijk: boolean }>,
  open: boolean,
  peekBezig: boolean,
): OkStrook | null {
  if (open || peekBezig || goedkeuringen.length === 0) return null;
  const g = goedkeuringen[0]; // dezelfde volgorde als de Approvals-tab
  return {
    id: g.id,
    titel: g.gevaarlijk ? 'Open in AXE CORE' : 'Wacht op jou',
    tekst: kort(g.detail ? `${g.titel} · ${g.detail}` : g.titel, 70),
    meer: goedkeuringen.length - 1,
    gevaarlijk: g.gevaarlijk,
  };
}
