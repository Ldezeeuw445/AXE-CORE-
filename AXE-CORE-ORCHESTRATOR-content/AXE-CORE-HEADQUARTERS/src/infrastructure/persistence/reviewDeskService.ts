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

/** Rij in user_settings: gevalideerde snapshot plus DB-stempel voor CAS. */
export type ReviewDeskRow = {
  snapshot: ReviewDeskSnapshot | null;
  rowUpdatedAt: string | null;
};

export type ReviewDeskSaveResult =
  | { ok: true; row: ReviewDeskRow }
  | { ok: false; reason: 'conflict'; row: ReviewDeskRow }
  | { ok: false; reason: 'invalid_schema'; issues: string }
  | { ok: false; reason: 'session_changed'; message: string }
  | { ok: false; reason: 'storage'; message: string }
  | { ok: false; reason: 'not_configured' | 'not_signed_in'; message: string };

const READ_DEADLINE_MS = 10_000;
const WRITE_DEADLINE_MS = 10_000;

export function observationAge(asOf: string, now = Date.now()): string {
  const hours = Math.max(0, Math.floor((now - Date.parse(asOf)) / 3600000));
  return hours >= 24 ? `${Math.floor(hours / 24)}d old` : `${hours}h old`;
}

async function requireOwnerSession(sb: NonNullable<ReturnType<typeof getSupabase>>): Promise<string> {
  const userId = await currentUserId(sb);
  if (!userId) throw new Error('Sign in to view your private business report.');
  return userId;
}

async function assertSameSession(
  sb: NonNullable<ReturnType<typeof getSupabase>>,
  userId: string,
): Promise<void> {
  if (await currentUserId(sb) !== userId) {
    throw new Error('Your session changed. Refresh the report.');
  }
}

/** Leest value en updated_at naast elkaar — basis voor CAS en herlezen na conflict. */
export async function loadReviewDeskRow(): Promise<ReviewDeskRow> {
  const sb = getSupabase();
  if (!sb) throw new Error('Cloud storage is not configured.');
  const userId = await requireOwnerSession(sb);
  const { data, error } = await sb.from('user_settings').select('value, updated_at')
    .eq('user_id', userId).eq('key', REVIEW_DESK_KEY)
    .abortSignal(AbortSignal.timeout(READ_DEADLINE_MS)).maybeSingle();
  if (error) throw new Error('The private report could not be loaded. Try Refresh.');
  await assertSameSession(sb, userId);
  if (!data) return { snapshot: null, rowUpdatedAt: null };
  return {
    snapshot: reviewDeskSchema.parse(data.value),
    rowUpdatedAt: String(data.updated_at),
  };
}

export async function loadReviewDesk(): Promise<ReviewDeskSnapshot | null> {
  const row = await loadReviewDeskRow();
  return row.snapshot;
}

/**
 * Schrijft alleen bij exacte match op eigenaar, sleutel en verwachte row updated_at.
 * Geen upsert: bij conflict of 0 gewijzigde rijen wordt niet opnieuw geprobeerd.
 */
export async function saveReviewDesk(
  next: unknown,
  expectedRowUpdatedAt: string,
): Promise<ReviewDeskSaveResult> {
  const sb = getSupabase();
  if (!sb) {
    return { ok: false, reason: 'not_configured', message: 'Cloud storage is not configured.' };
  }
  let userId: string;
  try {
    userId = await requireOwnerSession(sb);
  } catch (e) {
    return {
      ok: false,
      reason: 'not_signed_in',
      message: e instanceof Error ? e.message : 'Sign in to save your private business report.',
    };
  }

  const parsed = reviewDeskSchema.safeParse(next);
  if (!parsed.success) {
    return { ok: false, reason: 'invalid_schema', issues: parsed.error.message };
  }

  try {
    await assertSameSession(sb, userId);
  } catch (e) {
    return {
      ok: false,
      reason: 'session_changed',
      message: e instanceof Error ? e.message : 'Your session changed. Refresh the report.',
    };
  }

  const { data, error } = await sb.from('user_settings')
    .update({ value: parsed.data })
    .eq('user_id', userId)
    .eq('key', REVIEW_DESK_KEY)
    .eq('updated_at', expectedRowUpdatedAt)
    .select('value, updated_at')
    .abortSignal(AbortSignal.timeout(WRITE_DEADLINE_MS))
    .maybeSingle();

  if (error) {
    return { ok: false, reason: 'storage', message: 'The private report could not be saved. Try again.' };
  }

  if (!data) {
    let row: ReviewDeskRow;
    try {
      row = await loadReviewDeskRow();
    } catch {
      return {
        ok: false,
        reason: 'conflict',
        row: { snapshot: null, rowUpdatedAt: null },
      };
    }
    return { ok: false, reason: 'conflict', row };
  }

  try {
    await assertSameSession(sb, userId);
  } catch (e) {
    return {
      ok: false,
      reason: 'session_changed',
      message: e instanceof Error ? e.message : 'Your session changed. Refresh the report.',
    };
  }

  return {
    ok: true,
    row: {
      snapshot: reviewDeskSchema.parse(data.value),
      rowUpdatedAt: String(data.updated_at),
    },
  };
}
