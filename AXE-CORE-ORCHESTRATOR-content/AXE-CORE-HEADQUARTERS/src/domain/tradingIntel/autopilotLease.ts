/**
 * autopilotLease — wie de tradingcyclus draait, en welke.
 *
 * Eén cyclus tegelijk over alle apparaten heen (desktop, Android, VPS): de
 * lease in `core_autopilot_lease` (migratie 20260922120000). Deze module is
 * de pure helft: welke slot een cyclus claimt en hoe een houder heet.
 *
 * De slot is de due-minuut: laatste start + interval, in hele minuten sinds
 * epoch. Twee instanties die dezelfde laatste start lezen, rekenen dezelfde
 * slot uit en maar één krijgt hem; een slot wordt nooit twee keer uitgegeven.
 * Minuten en geen "cyclusnummer" omdat een gewijzigd interval de nummering
 * anders laat teruglopen — en een lagere slot dan de vorige wordt geweigerd.
 */
export const LEASE_ID = 'trading-autopilot';

/**
 * Langer dan de watchdog van de cyclus (20 min): een houder die crasht,
 * blokkeert hooguit tot dan, en een levende cyclus loopt nooit uit zijn lease.
 */
export const LEASE_TTL_S = 25 * 60;

export function cycleSlot(lastRunIso: string | null, intervalMin: number, now: number): number {
  const last = lastRunIso ? Date.parse(lastRunIso) : NaN;
  const due = Number.isFinite(last) ? last + intervalMin * 60_000 : now;
  return Math.floor(Math.min(due, now) / 60_000);
}

export type RunnerKind = 'desktop' | 'android' | 'browser' | 'vps';

export function holderId(kind: RunnerKind, instance: string): string {
  return `${kind}:${instance}`;
}
