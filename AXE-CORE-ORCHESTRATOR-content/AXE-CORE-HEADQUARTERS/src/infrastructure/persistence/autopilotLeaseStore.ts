/**
 * autopilotLeaseStore — de lease in Supabase (zie domain/tradingIntel/autopilotLease).
 *
 * Claimen gaat via de RPC try_autopilot_lease (atomair in Postgres); vrijgeven
 * en status schrijven zijn gewone updates met holder = mij.
 *
 * Bestaat de tabel of de functie niet (migratie nog niet toegepast), dan zegt
 * dit `unavailable` en draait de autopilot zoals voorheen met alleen de
 * in-process vlag — met die waarschuwing in de status, niet stil.
 */
import { getSupabase, currentUserId } from '@/infrastructure/supabase/supabaseClient';
import { LEASE_ID, holderId, type RunnerKind } from '@/domain/tradingIntel/autopilotLease';

export interface LeaseRow {
  holder: string;
  expiresAt: string;
  lastSlot: number | null;
  heartbeatAt?: string;
  status?: Record<string, unknown>;
}

export type LeaseClaim =
  | { kind: 'acquired'; lease: LeaseRow }
  | { kind: 'held'; lease: LeaseRow }
  | { kind: 'unavailable'; reason: string }
  | { kind: 'error'; reason: string };

let runnerKind: RunnerKind | null = null;
const instance = Math.random().toString(36).slice(2, 10);

/** Door de VPS-runner gezet; anders afgeleid uit de omgeving. */
export function setRunnerKind(kind: RunnerKind): void { runnerKind = kind; }

export function myHolderId(): string {
  const g = globalThis as { __TAURI_INTERNALS__?: unknown; navigator?: { userAgent?: string } };
  const kind: RunnerKind = runnerKind
    ?? (g.__TAURI_INTERNALS__ ? (/android/i.test(g.navigator?.userAgent ?? '') ? 'android' : 'desktop') : 'browser');
  return holderId(kind, instance);
}

// Gemeten tegen productie (22 sep): ontbrekende functie = PGRST202, ontbrekende tabel = PGRST205.
const MISSING = /PGRST202|PGRST205|42883|42P01|could not find the (function|table)|does not exist/i;

export async function tryAcquireAutopilotLease(slot: number, ttlSeconds: number): Promise<LeaseClaim> {
  const sb = getSupabase();
  if (!sb) return { kind: 'unavailable', reason: 'Supabase not configured' };
  const userId = await currentUserId(sb);
  if (!userId) return { kind: 'error', reason: 'not signed in — cannot claim the autopilot lease' };
  const holder = myHolderId();
  const { data, error } = await sb.rpc('try_autopilot_lease', {
    p_id: LEASE_ID, p_user_id: userId, p_holder: holder, p_ttl_seconds: ttlSeconds, p_slot: slot,
  });
  if (error) {
    const text = `${error.code ?? ''} ${error.message}`;
    return MISSING.test(text)
      ? { kind: 'unavailable', reason: 'lease table not migrated (20260922120000) — single-instance guard only' }
      : { kind: 'error', reason: error.message };
  }
  const row = (Array.isArray(data) ? data[0] : data) as { acquired: boolean; holder: string; expires_at: string; last_slot: number | null } | undefined;
  if (!row) return { kind: 'error', reason: 'lease RPC returned no row' };
  const lease: LeaseRow = { holder: row.holder, expiresAt: row.expires_at, lastSlot: row.last_slot == null ? null : Number(row.last_slot) };
  return row.acquired ? { kind: 'acquired', lease } : { kind: 'held', lease };
}

/** Geef de lease vrij (expires_at = nu) en laat de status achter. last_slot blijft staan. */
export async function releaseAutopilotLease(status: Record<string, unknown>): Promise<void> {
  const sb = getSupabase();
  if (!sb) return;
  const now = new Date().toISOString();
  const { error } = await sb.from('core_autopilot_lease')
    .update({ expires_at: now, heartbeat_at: now, status })
    .eq('id', LEASE_ID)
    .eq('holder', myHolderId());
  if (error && !MISSING.test(`${error.code ?? ''} ${error.message}`)) {
    console.warn('[autopilotLease] release failed', error.message);
  }
}

export async function readAutopilotLease(): Promise<LeaseRow | null> {
  const sb = getSupabase();
  if (!sb) return null;
  const { data, error } = await sb.from('core_autopilot_lease')
    .select('holder, expires_at, last_slot, heartbeat_at, status')
    .eq('id', LEASE_ID)
    .maybeSingle();
  if (error || !data) return null;
  const r = data as { holder: string; expires_at: string; last_slot: number | null; heartbeat_at: string; status: Record<string, unknown> };
  return { holder: r.holder, expiresAt: r.expires_at, lastSlot: r.last_slot, heartbeatAt: r.heartbeat_at, status: r.status };
}
