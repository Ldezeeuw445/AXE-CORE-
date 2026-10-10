import { z } from 'zod';
import { currentUserId, getSupabase } from '@/infrastructure/supabase/supabaseClient';

// Eén privérapport per eigenaar. Geen bedrijfsgegevens in de publieke bundel.
export const REVIEW_DESK_KEY = 'axe_website_review_desk_v1';
const text = z.string().max(30000);
const date = z.string().datetime({ offset: true });
const https = z.string().url().refine(value => new URL(value).protocol === 'https:');
export const reviewDeskSchema = z.object({
  schemaVersion: z.literal(1),
  updatedAt: date,
  summary: text,
  metrics: z.array(z.object({
    label: z.string().max(100), value: z.number().finite().nullable(),
    unit: z.enum(['EUR', 'count', 'percent']), asOf: date, source: text,
  })).max(20),
  leads: z.array(z.object({
    name: z.string().max(200), status: z.string().max(100), note: text,
    asOf: date, sourceUrl: https.optional(),
  })).max(200),
  channels: z.array(z.object({ name: z.string().max(100), status: text, asOf: date })).max(20),
  sections: z.array(z.object({ title: z.string().max(200), body: text, asOf: date })).max(30),
  actions: z.array(text).max(30),
  links: z.array(z.object({ label: z.string().max(100), url: https })).max(20),
});
export type ReviewDeskSnapshot = z.infer<typeof reviewDeskSchema>;

export function observationAge(asOf: string, now = Date.now()): string {
  const hours = Math.max(0, Math.floor((now - Date.parse(asOf)) / 3600000));
  return hours >= 24 ? `${Math.floor(hours / 24)}d old` : `${hours}h old`;
}

export interface ReviewDeskRow {
  ownerId: string;
  rowUpdatedAt: string;
  snapshot: ReviewDeskSnapshot;
}

export async function loadReviewDeskRow(): Promise<ReviewDeskRow | null> {
  const sb = getSupabase();
  if (!sb) throw new Error('Cloud storage is not configured.');
  const userId = await currentUserId(sb);
  if (!userId) throw new Error('Sign in to view your private business report.');
  const { data, error } = await sb.from('user_settings').select('value, updated_at')
    .eq('user_id', userId).eq('key', REVIEW_DESK_KEY)
    .abortSignal(AbortSignal.timeout(10000)).maybeSingle();
  if (error) throw new Error('The private report could not be loaded. Try Refresh.');
  // Geen lokaal gedeelde cache: een ander account mag nooit het vorige rapport zien.
  if (await currentUserId(sb) !== userId) throw new Error('Your session changed. Refresh the report.');
  if (!data) return null;
  const rowUpdatedAt = date.parse(data.updated_at);
  return { ownerId: userId, rowUpdatedAt, snapshot: reviewDeskSchema.parse(data.value) };
}

export async function loadReviewDesk(): Promise<ReviewDeskSnapshot | null> {
  return (await loadReviewDeskRow())?.snapshot ?? null;
}

export type ReviewDeskSaveResult =
  | { ok: true; row: ReviewDeskRow }
  | { ok: false; reason: 'invalid_schema' | 'session_changed' }
  | { ok: false; reason: 'conflict'; row: ReviewDeskRow | null };

// Alleen vervangen van een eerder gelezen eigenaarsrij; geen INSERT of blinde retry.
export async function saveReviewDesk(next: unknown, expected: ReviewDeskRow): Promise<ReviewDeskSaveResult> {
  const parsed = reviewDeskSchema.safeParse(next);
  if (!parsed.success || !date.safeParse(expected.rowUpdatedAt).success) {
    return { ok: false, reason: 'invalid_schema' };
  }
  const sb = getSupabase();
  if (!sb) throw new Error('Cloud storage is not configured.');
  if (await currentUserId(sb) !== expected.ownerId) return { ok: false, reason: 'session_changed' };
  // De live tabel heeft geen updated_at-trigger: iedere write vernieuwt zelf het CAS-slot.
  const rowUpdatedAt = new Date(Math.max(Date.now(), Date.parse(expected.rowUpdatedAt) + 1)).toISOString();
  const { data, error } = await sb.from('user_settings')
    .update({ value: parsed.data, updated_at: rowUpdatedAt })
    .eq('user_id', expected.ownerId).eq('key', REVIEW_DESK_KEY)
    .eq('updated_at', expected.rowUpdatedAt).select('updated_at')
    .abortSignal(AbortSignal.timeout(10000)).maybeSingle();
  if (error) throw new Error('The private report could not be saved. Reload before trying again.');
  if (await currentUserId(sb) !== expected.ownerId) return { ok: false, reason: 'session_changed' };
  // Teruglezen controleert opslag; een andere writer kan intussen opnieuw geschreven hebben.
  const row = await loadReviewDeskRow();
  if (row && row.ownerId !== expected.ownerId) return { ok: false, reason: 'session_changed' };
  if (!data || !row || Date.parse(row.rowUpdatedAt) !== Date.parse(rowUpdatedAt) ||
      JSON.stringify(row.snapshot) !== JSON.stringify(parsed.data)) {
    return { ok: false, reason: 'conflict', row };
  }
  return { ok: true, row };
}
