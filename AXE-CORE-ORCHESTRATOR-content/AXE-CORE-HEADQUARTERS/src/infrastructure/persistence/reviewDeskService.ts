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

export async function loadReviewDesk(): Promise<ReviewDeskSnapshot | null> {
  const sb = getSupabase();
  if (!sb) throw new Error('Cloud storage is not configured.');
  const userId = await currentUserId(sb);
  if (!userId) throw new Error('Sign in to view your private business report.');
  const { data, error } = await sb.from('user_settings').select('value')
    .eq('user_id', userId).eq('key', REVIEW_DESK_KEY)
    .abortSignal(AbortSignal.timeout(10000)).maybeSingle();
  if (error) throw new Error('The private report could not be loaded. Try Refresh.');
  // Geen lokaal gedeelde cache: een ander account mag nooit het vorige rapport zien.
  if (await currentUserId(sb) !== userId) throw new Error('Your session changed. Refresh the report.');
  return data ? reviewDeskSchema.parse(data.value) : null;
}
