/**
 * Usage & Credits — weergave van de aggregatie uit GET /usage-credits.
 *
 * Geen I/O. De backend telt; hier alleen labels, balken en of de caps gehaald
 * zijn, zodat de Settings-view en een eventuele load balancer dezelfde woorden
 * gebruiken.
 */
export type UsageStand = 'under' | 'met' | 'over';

export interface UsageSeat {
  id: string;
  label: string;
  family: string | null;
  kind: string | null;
  notes?: string | null;
  sessions_today: number;
  sessions_week: number;
  sessions_min: number;
  sessions_max: number;
  window_hours: number | null;
  window_free_at: string | null;
  window_open: boolean;
  rate_limited: boolean;
  last_limit: string | null;
  last_limit_at: string | null;
  last_failure: string | null;
  last_failure_at: string | null;
  logged_in: boolean | null;
  email: string | null;
  machine: string | null;
  current_task: string | null;
  seen: boolean;
}

export interface UsageApp {
  id: string;
  label: string;
  notes?: string | null;
  sessions_today: number;
  sessions_week: number;
  sessions_min: number;
  sessions_max: number;
  stand: UsageStand;
  met: boolean;
}

export interface UsageSpreadSeat {
  id: string;
  sessions_today: number;
  share: number;
}

export interface UsageSpread {
  even: boolean;
  delta: number;
  paid_today: number;
  target_each: number;
  seats: UsageSpreadSeat[];
  note: string;
}

export interface UsageCreditsConfig {
  timezone: string;
  spread_seat_ids: string[];
  seats: Array<{
    id: string;
    label: string;
    family?: string | null;
    kind?: string | null;
    sessions_min: number;
    sessions_max: number;
    window_hours: number | null;
    notes?: string | null;
  }>;
  apps: Array<{
    id: string;
    label: string;
    sessions_min: number;
    sessions_max: number;
    notes?: string | null;
  }>;
}

export interface UsageCreditsSnapshot {
  generated_at: string;
  timezone: string;
  seats: UsageSeat[];
  apps: UsageApp[];
  spread: UsageSpread;
  apps_met: number;
  apps_total: number;
  config: UsageCreditsConfig;
}

const SEAT_ACCENT: Record<string, string> = {
  claude: '#f59e0b',
  chatgpt: '#34d399',
  cursor: '#60a5fa',
  grok: '#1DA1F2',
  vps: '#fb923c',
};

export function seatAccent(family: string | null | undefined): string {
  return SEAT_ACCENT[family || ''] || 'var(--text-secondary)';
}

export function budgetPct(today: number, min: number, max: number): number {
  const plafond = Math.max(max, min, 1);
  return Math.min(100, (today / plafond) * 100);
}

export function budgetLabel(stand: UsageStand): { toon: 'ok' | 'warn' | 'bad'; tekst: string } {
  if (stand === 'met') return { toon: 'ok', tekst: 'On budget' };
  if (stand === 'over') return { toon: 'bad', tekst: 'Over budget' };
  return { toon: 'warn', tekst: 'Under budget' };
}

export function vensterTekst(iso: string | null, open: boolean, nowMs = Date.now()): string {
  if (open || !iso) return 'Free';
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return 'Free';
  const min = Math.max(0, Math.round((t - nowMs) / 60_000));
  if (min < 1) return 'Free';
  if (min < 60) return `Frees in ${min}m`;
  const h = Math.round(min / 60);
  return h < 48 ? `Frees in ${h}h` : `Frees in ${Math.round(h / 24)}d`;
}

export function seatStand(stoel: Pick<UsageSeat, 'window_open' | 'rate_limited' | 'logged_in' | 'seen' | 'kind'>): {
  toon: 'ok' | 'warn' | 'bad' | 'muted' | 'info';
  tekst: string;
} {
  if (stoel.kind === 'free-vps') {
    return stoel.seen ? { toon: 'info', tekst: 'Free capacity' } : { toon: 'muted', tekst: 'VPS' };
  }
  if (!stoel.seen) return { toon: 'muted', tekst: 'Not seen' };
  if (stoel.logged_in === false) return { toon: 'bad', tekst: 'Logged out' };
  if (stoel.rate_limited || !stoel.window_open) return { toon: 'warn', tekst: 'In window' };
  if (stoel.logged_in === true) return { toon: 'ok', tekst: 'Ready' };
  return { toon: 'muted', tekst: 'Unknown' };
}

export function spreadBalken(spread: UsageSpread): Array<{ id: string; pct: number; sessions: number }> {
  const n = spread.seats.length || 1;
  return spread.seats.map((s) => ({
    id: s.id,
    sessions: s.sessions_today,
    pct: spread.paid_today > 0 ? s.share * 100 : 100 / n,
  }));
}
