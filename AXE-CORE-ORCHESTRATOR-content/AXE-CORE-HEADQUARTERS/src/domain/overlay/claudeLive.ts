/**
 * Claude Code live in de AXE-notch (Luka, 18 nov 2026: "dan heb ik jou en axe
 * in de notch"). Leest de stand die scripts/claude-notch-hook.py schrijft en
 * maakt er de paar regels van die de notch toont. Puur, geen I/O.
 *
 * Volgt (zoals in de Pulsar-opzet) de sessie die op Luka wacht, anders de
 * laatst bijgewerkte -- en springt nooit heen en weer zolang die leeft.
 */
export type ClaudeStapSoort = 'lezen' | 'zoeken' | 'bewerken' | 'uitvoeren' | 'web' | 'agent' | 'plan' | 'mcp' | 'overig';

export interface ClaudeStap { tool: string; soort: ClaudeStapSoort; wat: string; staat: 'bezig' | 'klaar' | 'mislukt'; t: number }
export interface ClaudeSessie {
  id: string; project?: string; vraag?: string; begon: number; bijgewerkt?: number; eind?: number;
  stappen: ClaudeStap[]; klaar: boolean; wacht?: boolean; melding?: string;
  vraag_toestemming?: { id: string; tool?: string; opdracht?: string; altijd_kan?: boolean; t?: number };
}
export interface ClaudeStand { sessies?: Record<string, ClaudeSessie>; bijgewerkt?: number }

export interface ClaudeLive {
  sessieId: string;
  project: string;
  vraag: string;
  /** Wat Claude nu doet (of als laatste deed). */
  nu: string;
  /** De stap daarvoor, klein en grijs. */
  vorige: string;
  soort: ClaudeStapSoort;
  toestand: 'bezig' | 'wacht' | 'klaar';
  seconden: number;
  stappen: ClaudeStap[];
  aantalSessies: number;
  /** Claude vraagt toestemming: de HELE opdracht, nooit afgekapt. */
  toestemming: { id: string; tool: string; opdracht: string; altijdKan: boolean } | null;
}

/** Een sessie die zo lang niets deed, telt niet meer als live. */
export const OUD_NA_S = 15 * 60;
/** Hoe lang "klaar" nog zichtbaar blijft (18 nov: na 6 s leek de notch voor
 *  Luka "nog de oude" -- klaar betekent juist: jouw beurt, dus laat het staan). */
export const KLAAR_ZICHTBAAR_S = 10 * 60;

export function leesStand(ruw: string | null | undefined): ClaudeStand {
  if (!ruw) return {};
  try {
    const s = JSON.parse(ruw) as ClaudeStand;
    return s && typeof s === 'object' ? s : {};
  } catch { return {}; }
}

function kiesSessie(stand: ClaudeStand, nuS: number, vorige?: string | null): ClaudeSessie | null {
  const levend = Object.values(stand.sessies ?? {}).filter((s) => nuS - (s.bijgewerkt ?? s.begon) < OUD_NA_S);
  if (!levend.length) return null;
  const wacht = levend.find((s) => s.wacht);
  if (wacht) return wacht;
  const blijf = vorige ? levend.find((s) => s.id === vorige && !s.klaar) : undefined;
  if (blijf) return blijf;
  return [...levend].sort((a, b) => (b.bijgewerkt ?? b.begon) - (a.bijgewerkt ?? a.begon))[0];
}

export function claudeLive(stand: ClaudeStand, nuS: number, vorige?: string | null): ClaudeLive | null {
  const s = kiesSessie(stand, nuS, vorige);
  if (!s) return null;
  if (s.klaar && nuS - (s.eind ?? s.bijgewerkt ?? s.begon) > KLAAR_ZICHTBAAR_S && !s.wacht) {
    // Klaar en even geleden: toon hem niet meer in de compacte pil.
    return null;
  }
  const stappen = s.stappen ?? [];
  const laatste = stappen[stappen.length - 1];
  const daarvoor = stappen[stappen.length - 2];
  const toestand: ClaudeLive['toestand'] = s.wacht ? 'wacht' : s.klaar ? 'klaar' : 'bezig';
  return {
    sessieId: s.id,
    project: s.project ?? '',
    vraag: s.vraag ?? '',
    nu: toestand === 'wacht' ? (s.melding || 'Wacht op jou') : toestand === 'klaar' ? 'Klaar · jouw beurt' : (laatste?.wat ?? 'Denkt na…'),
    vorige: toestand === 'klaar' ? (laatste?.wat ?? '') : (daarvoor?.wat ?? ''),
    soort: laatste?.soort ?? 'overig',
    toestand,
    seconden: Math.max(0, Math.round((s.klaar ? (s.eind ?? nuS) : nuS) - s.begon)),
    stappen: [...stappen].reverse(),
    aantalSessies: Object.keys(stand.sessies ?? {}).length,
    toestemming: s.vraag_toestemming && /^[0-9a-f]{16}$/.test(s.vraag_toestemming.id)
      ? { id: s.vraag_toestemming.id, tool: s.vraag_toestemming.tool ?? '', opdracht: s.vraag_toestemming.opdracht ?? '',
          altijdKan: Boolean(s.vraag_toestemming.altijd_kan) }
      : null,
  };
}

export function klok(seconden: number): string {
  const m = Math.floor(seconden / 60);
  const s = seconden % 60;
  return m >= 60 ? `${Math.floor(m / 60)}:${String(m % 60).padStart(2, '0')}:${String(s).padStart(2, '0')}` : `${m}:${String(s).padStart(2, '0')}`;
}
