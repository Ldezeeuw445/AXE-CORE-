/**
 * Focusmodus -- de stand (tot wanneer) en wat er tijdens de focus is
 * vastgehouden. Per apparaat in localStorage; laag genoeg dat meldingen
 * (infrastructure/ui) en de spraakrij er zonder kringverwijzing bij kunnen.
 */
const SLEUTEL = 'axe_focus_v1';
const SEIN = 'axe-focus';

interface FocusStand {
  tot: number;
  minuten: number;
  meldingen: number;
  berichten: number;
}

function lees(): FocusStand | null {
  try {
    const o = JSON.parse(localStorage.getItem(SLEUTEL) ?? 'null') as FocusStand | null;
    return o && typeof o.tot === 'number' ? o : null;
  } catch {
    return null;
  }
}

function schrijf(s: FocusStand | null): void {
  try {
    if (s) localStorage.setItem(SLEUTEL, JSON.stringify(s)); else localStorage.removeItem(SLEUTEL);
  } catch { /* privémodus */ }
  if (typeof window !== 'undefined') window.dispatchEvent(new Event(SEIN));
}

export function focusStand(): FocusStand | null {
  return lees();
}

/** Loopt er nu een focus? (Een verlopen focus telt niet.) */
export function inFocus(nu = Date.now()): boolean {
  const s = lees();
  return !!s && nu < s.tot;
}

export function startFocus(minuten: number, nu = Date.now()): FocusStand {
  const s = { tot: nu + minuten * 60_000, minuten, meldingen: 0, berichten: 0 };
  schrijf(s);
  return s;
}

/** Stop de focus en geef terug wat er vastgehouden is. */
export function stopFocus(): FocusStand | null {
  const s = lees();
  schrijf(null);
  return s;
}

export function telVastgehouden(soort: 'meldingen' | 'berichten', n = 1): void {
  const s = lees();
  if (!s || Date.now() >= s.tot) return;
  schrijf({ ...s, [soort]: s[soort] + n });
}

export const FOCUS_SEIN = SEIN;
