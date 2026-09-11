/**
 * De briefing van vandaag, los van de opstartroutine.
 *
 * ## Waarom dit een eigen bestand is
 *
 * Deze functie stond in `axeBootstrap.ts`, en `voiceStore` haalde hem daar
 * statisch vandaan. Dat ene importpijltje hield de HELE opstartroutine in de
 * eerste brok: obsidian-sync, de trading-autopilot, de geheugenbeheerder, de
 * ragvectoren, elke gateway die daaronder hangt. Rollup kan een module die
 * ergens statisch aan hangt niet verplaatsen, ook niet als hij verderop netjes
 * dynamisch wordt geladen -- dan krijg je alleen de waarschuwing en niet de
 * splitsing. Gemeten: de eerste brok was 2.267 kB, en dit was een van de
 * touwtjes die eraan trok.
 *
 * De functie zelf leest één rij uit Supabase en heeft met opstarten niets te
 * maken. Hij hoorde hier al thuis; dat het ook nog een megabyte scheelt is
 * meegenomen.
 */

import { getSupabase } from '@/infrastructure/supabase/supabaseClient';

/** Fetches today's Daily Briefing content (written by the VPS cron job,
 *  core_schedules "Daily Briefing" + notify:true) if one landed today —
 *  real data, not fabricated. Returns null if none exists yet (e.g. app
 *  opened before the 08:00 run, or the job hasn't fired today). */
export async function loadTodaysBriefing(): Promise<string | null> {
  try {
    const sb = getSupabase();
    if (!sb) return null;
    const since = new Date(); since.setHours(0, 0, 0, 0);
    const { data } = await sb
      .from('core_notifications')
      .select('message, created_at')
      .gte('created_at', since.toISOString())
      .ilike('message', 'Daily Briefing:%')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (!data?.message) return null;
    // Strip the "Daily Briefing: " prefix _run_schedule_action's generic
    // notify wrapper adds — the greeting already implies what this is.
    return data.message.replace(/^Daily Briefing:\s*/i, '').trim() || null;
  } catch {
    return null;
  }
}
