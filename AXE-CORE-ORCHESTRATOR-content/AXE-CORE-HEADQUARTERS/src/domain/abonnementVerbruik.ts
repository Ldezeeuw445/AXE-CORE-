/**
 * Wat een abonnement nog kan, zoals de aanbieder het zelf meet.
 *
 * Luka, 11 okt 2026: "zien hoeveel ik nog kan gebruiken per account,
 * subscription en sessie, zoals elk account het laat zien". De host leest het
 * bij Anthropic (/api/oauth/usage) en OpenAI (wham/usage) met het token van dat
 * account; zie backend/axe_api/abonnement_verbruik.py. Hier alleen de vertaling
 * naar wat een kaart toont: een status en twee balken (sessie, week).
 *
 * Tot nu toe stond elke abonnementskaart op "Offline": de host kon alleen
 * zeggen dat de CLI bestond, niet dat de login werkte. Een geslaagde
 * verbruiksmeting IS dat bewijs, dus die bepaalt nu de status.
 */
/**
 * `idle`: ingelogd, maar het toegangstoken is verlopen omdat de stoel een tijd
 * niets deed. De CLI ververst het bij de volgende run, en de planner doet elke
 * dag een check-in (agent_runner.houd_warm). Geen waarschuwing: tot 20 okt
 * stond precies dit als "Limit seen · Token expired" op drie kaarten.
 */
export type VerbruikStatus = 'ok' | 'idle' | 'expired' | 'blocked' | 'not_logged_in' | 'error';
export type Venster = { procent: number; reset: string | null };
export type AbonnementVerbruik = {
  motor: string;
  label: string;
  account: string | null;
  status: VerbruikStatus;
  plan?: string | null;
  reden?: string;
  login?: string;
  dashboard?: string;
  sessie?: Venster;
  week?: Venster;
  week_opus?: Venster;
  week_sonnet?: Venster;
  limiet_bereikt?: boolean;
};

type Toon = 'ok' | 'bad' | 'warn' | 'info' | 'muted';

/** De status rechtsboven op de kaart. Groen alleen als de aanbieder het account echt accepteerde. */
export function verbruikStand(v: AbonnementVerbruik | undefined): { toon: Toon; tekst: string } {
  if (!v) return { toon: 'muted', tekst: 'Checking' };
  switch (v.status) {
    case 'ok': {
      const vol = Math.max(v.sessie?.procent ?? 0, v.week?.procent ?? 0);
      if (v.limiet_bereikt || vol >= 100) return { toon: 'bad', tekst: 'Limit reached' };
      if (vol >= 80) return { toon: 'warn', tekst: 'Almost full' };
      return { toon: 'ok', tekst: 'Online' };
    }
    case 'idle': return { toon: 'info', tekst: 'Idle' };
    case 'expired': return { toon: 'warn', tekst: 'Login expired' };
    case 'blocked': return { toon: 'bad', tekst: 'Blocked' };
    case 'not_logged_in': return { toon: 'bad', tekst: 'Not logged in' };
    default: return { toon: 'muted', tekst: 'Unknown' };
  }
}

/** "resets in 3h 12m" / "resets in 2d 4h"; leeg als onbekend of voorbij. */
export function resetTekst(reset: string | null | undefined, nu: number = Date.now()): string {
  if (!reset) return '';
  const ms = Date.parse(reset) - nu;
  if (!Number.isFinite(ms) || ms <= 0) return '';
  const min = Math.round(ms / 60_000);
  if (min < 60) return `resets in ${min}m`;
  const uur = Math.floor(min / 60);
  if (uur < 48) return `resets in ${uur}h ${min % 60}m`;
  return `resets in ${Math.floor(uur / 24)}d ${uur % 24}h`;
}

/** Balken zoals de aanbieder ze toont: gebruikt deel van de sessie en van de week. */
export function verbruikBalken(v: AbonnementVerbruik | undefined, nu: number = Date.now()) {
  if (!v || v.status !== 'ok') return [];
  const rij = (label: string, w?: Venster) => w ? [{
    label,
    waarde: `${Math.round(w.procent)}% used${resetTekst(w.reset, nu) ? ` · ${resetTekst(w.reset, nu)}` : ''}`,
    pct: w.procent,
  }] : [];
  return [
    ...rij('Session (5h)', v.sessie),
    ...rij('Week', v.week),
    ...rij('Week · Opus', v.week_opus),
    ...rij('Week · Sonnet', v.week_sonnet),
  ];
}

/** De regel onder de kaart: waarom hij niet werkt, en wat jij dan doet. */
export function verbruikMelding(v: AbonnementVerbruik | undefined): string | undefined {
  if (!v) return undefined;
  if (v.status === 'idle' || (v.status === 'ok' && !v.reden)) return undefined;
  const actie = (v.status === 'expired' || v.status === 'not_logged_in') && v.login ? ` Log in: ${v.login}` : '';
  return `${v.reden ?? ''}${actie}`.trim() || undefined;
}
