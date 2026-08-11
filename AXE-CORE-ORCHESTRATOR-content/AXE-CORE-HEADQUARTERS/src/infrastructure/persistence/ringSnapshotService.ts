/**
 * ringSnapshotService — latest smart-ring vitals (Da Rings / VR11 style).
 * Manual or [RING_LOG:] — no public live API from MO YOUNG.
 */

import { saveSetting } from '@/infrastructure/persistence/userSettingsService';
import { getSupabase, currentUserId } from '@/infrastructure/supabase/supabaseClient';

export interface RingSnapshot {
  steps?: number;
  stepsGoal?: number;
  heartRate?: number;
  spo2?: number;
  hrv?: number;
  stress?: number;
  calories?: number;
  caloriesGoal?: number;
  /** Active minutes */
  durationMin?: number;
  durationGoal?: number;
  sleepScore?: number;
  sleepHours?: number;
  battery?: number;
  temperature?: number;
  /** Systolic / diastolic */
  bpSys?: number;
  bpDia?: number;
  note?: string;
  updatedAt: string;
  source?: string;
  deviceName?: string;
}

const LS_KEY = 'axe_ring_snapshot';
const HISTORY_KEY = 'axe_ring_history';
const MAX_HISTORY = 40;

function readLocal(): RingSnapshot | null {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as RingSnapshot;
  } catch {
    return null;
  }
}

function writeLocal(s: RingSnapshot): void {
  localStorage.setItem(LS_KEY, JSON.stringify(s));
  void saveSetting(LS_KEY, s);
  try {
    const hist: RingSnapshot[] = JSON.parse(localStorage.getItem(HISTORY_KEY) || '[]');
    hist.unshift(s);
    localStorage.setItem(HISTORY_KEY, JSON.stringify(hist.slice(0, MAX_HISTORY)));
  } catch { /* */ }
}

/** Always fetches fresh from Supabase (never the local-cache-first path
 *  `loadSetting` uses elsewhere) — this store can be updated remotely by
 *  the ring-webhook edge function (iPhone Shortcuts push), so a stale
 *  local cache would silently hide those updates forever otherwise. Falls
 *  back to the local cache only when Supabase is unreachable/unauthed. */
export async function getRingSnapshot(): Promise<RingSnapshot | null> {
  try {
    const sb = getSupabase();
    if (sb) {
      const userId = await currentUserId(sb);
      if (userId) {
        const { data } = await sb
          .from('user_settings')
          .select('value')
          .eq('user_id', userId)
          .eq('key', LS_KEY)
          .single();
        if (data?.value) {
          const cloud = data.value as RingSnapshot;
          localStorage.setItem(LS_KEY, JSON.stringify(cloud));
          return cloud;
        }
      }
    }
  } catch {
    /* fall through to local */
  }
  return readLocal();
}

export async function setRingSnapshot(
  partial: Partial<Omit<RingSnapshot, 'updatedAt'>> & { updatedAt?: string },
): Promise<RingSnapshot> {
  const prev = (await getRingSnapshot()) || { updatedAt: new Date().toISOString() };
  const next: RingSnapshot = {
    ...prev,
    ...partial,
    updatedAt: partial.updatedAt || new Date().toISOString(),
    source: partial.source || prev.source || 'Da Rings',
    deviceName: partial.deviceName || prev.deviceName || 'VR11',
    stepsGoal: partial.stepsGoal ?? prev.stepsGoal ?? 10000,
    caloriesGoal: partial.caloriesGoal ?? prev.caloriesGoal ?? 300,
    durationGoal: partial.durationGoal ?? prev.durationGoal ?? 30,
  };
  writeLocal(next);
  return next;
}

export function formatRingForContext(s: RingSnapshot | null): string {
  if (!s) return '';
  const parts: string[] = [];
  if (s.steps != null) parts.push(`steps ${s.steps}${s.stepsGoal ? `/${s.stepsGoal}` : ''}`);
  if (s.heartRate != null) parts.push(`HR ${s.heartRate}`);
  if (s.spo2 != null) parts.push(`SpO2 ${s.spo2}%`);
  if (s.hrv != null) parts.push(`HRV ${s.hrv}ms`);
  if (s.stress != null) parts.push(`stress ${s.stress}`);
  if (s.calories != null) parts.push(`kcal ${s.calories}`);
  if (s.durationMin != null) parts.push(`active ${s.durationMin}min`);
  if (s.bpSys != null && s.bpDia != null) parts.push(`BP ${s.bpSys}/${s.bpDia}`);
  if (s.sleepHours != null) parts.push(`sleep ${s.sleepHours}h`);
  if (s.battery != null) parts.push(`battery ${s.battery}%`);
  if (!parts.length) return '';
  return `## Smart ring (${s.deviceName || s.source || 'Da Rings'})\nUpdated ${s.updatedAt}\n${parts.join(' · ')}`;
}
