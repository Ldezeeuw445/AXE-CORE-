/**
 * habitTrackerService — daily habit/goal ring-progress cards for the right
 * panel (Daily Journal, Focus, Ice Bath, Trade, Developing, 10K Steps,
 * Drink water, Workout, Daylight, Sleep, or whatever Luka defines). Manual
 * or chat-logged (no wearable feeds these — separate from the ring/health
 * data in ringSnapshotService.ts). Resets each item's `current` to 0 when
 * the local calendar day changes; goals/definitions persist across days.
 */

import { saveSetting } from '@/infrastructure/persistence/userSettingsService';
import { getSupabase, currentUserId } from '@/infrastructure/supabase/supabaseClient';

export type HabitUnit = 'count' | 'min' | 'hr' | 'liters' | 'steps';

export interface HabitItem {
  id: string;
  label: string;
  icon: string;
  color: string;
  goal: number;
  unit: HabitUnit;
  current: number;
}

export interface HabitSnapshot {
  date: string;
  items: HabitItem[];
}

const LS_KEY = 'axe_habit_snapshot';

function todayKey(): string {
  return new Date().toISOString().slice(0, 10);
}

const DEFAULT_ITEMS: HabitItem[] = [
  { id: 'journal', label: 'Daily Journal', icon: 'BookText', color: '#22C55E', goal: 2, unit: 'count', current: 0 },
  { id: 'focus', label: 'Focus · Learn · Read', icon: 'BrainCircuit', color: '#EAB308', goal: 1, unit: 'hr', current: 0 },
  { id: 'ice', label: 'Ice Bath or Cold Shower', icon: 'Snowflake', color: '#38BDF8', goal: 1, unit: 'count', current: 0 },
  { id: 'trade', label: 'Trade', icon: 'BarChart3', color: '#3B82F6', goal: 4, unit: 'hr', current: 0 },
  { id: 'dev', label: 'Developing', icon: 'Code2', color: '#94A3B8', goal: 3, unit: 'hr', current: 0 },
  { id: 'steps', label: '10K Steps', icon: 'Footprints', color: '#A855F7', goal: 10000, unit: 'steps', current: 0 },
  { id: 'water', label: 'Drink water', icon: 'Droplets', color: '#0EA5E9', goal: 3, unit: 'liters', current: 0 },
  { id: 'workout', label: 'Workout', icon: 'Dumbbell', color: '#F97316', goal: 1, unit: 'hr', current: 0 },
  { id: 'daylight', label: 'Time in daylight', icon: 'Sun', color: '#F59E0B', goal: 60, unit: 'min', current: 0 },
  { id: 'sleep', label: 'Sleep', icon: 'BedDouble', color: '#60A5FA', goal: 7, unit: 'hr', current: 0 },
];

function readLocal(): HabitSnapshot | null {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as HabitSnapshot;
  } catch {
    return null;
  }
}

function rolledOver(snap: HabitSnapshot): HabitSnapshot {
  if (snap.date === todayKey()) return snap;
  return { date: todayKey(), items: snap.items.map(i => ({ ...i, current: 0 })) };
}

function writeLocal(snap: HabitSnapshot): void {
  localStorage.setItem(LS_KEY, JSON.stringify(snap));
  void saveSetting(LS_KEY, snap);
}

/** Always fetches fresh from Supabase (same reasoning as ringSnapshotService:
 *  chat-logged updates from elsewhere should be visible, not hidden behind a
 *  stale local cache), falling back to local cache when offline/unauthed. */
export async function getHabitSnapshot(): Promise<HabitSnapshot> {
  let snap: HabitSnapshot | null = null;
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
        if (data?.value) snap = data.value as HabitSnapshot;
      }
    }
  } catch {
    /* fall through to local */
  }
  if (!snap) snap = readLocal();
  if (!snap) snap = { date: todayKey(), items: DEFAULT_ITEMS };
  const rolled = rolledOver(snap);
  if (rolled !== snap) writeLocal(rolled);
  else localStorage.setItem(LS_KEY, JSON.stringify(rolled));
  return rolled;
}

export async function setHabitProgress(id: string, current: number): Promise<HabitSnapshot> {
  const snap = await getHabitSnapshot();
  const items = snap.items.map(i => (i.id === id ? { ...i, current: Math.max(0, current) } : i));
  const next = { date: todayKey(), items };
  writeLocal(next);
  return next;
}

export async function addHabitProgress(id: string, delta: number): Promise<HabitSnapshot> {
  const snap = await getHabitSnapshot();
  const item = snap.items.find(i => i.id === id);
  return setHabitProgress(id, (item?.current ?? 0) + delta);
}

/** Logs progress by fuzzy label match (chat tool) — finds the item whose
 *  label contains the given text, case-insensitive. */
export async function logHabitByLabel(label: string, current: number): Promise<HabitItem | null> {
  const snap = await getHabitSnapshot();
  const needle = label.trim().toLowerCase();
  const item = snap.items.find(i => i.label.toLowerCase().includes(needle) || i.id === needle);
  if (!item) return null;
  const next = await setHabitProgress(item.id, current);
  return next.items.find(i => i.id === item.id) ?? null;
}

export function upsertHabitDef(item: Omit<HabitItem, 'current'> & { current?: number }): Promise<HabitSnapshot> {
  return getHabitSnapshot().then(snap => {
    const exists = snap.items.some(i => i.id === item.id);
    const items = exists
      ? snap.items.map(i => (i.id === item.id ? { ...i, ...item, current: item.current ?? i.current } : i))
      : [...snap.items, { ...item, current: item.current ?? 0 }];
    const next = { date: todayKey(), items };
    writeLocal(next);
    return next;
  });
}

export async function removeHabit(id: string): Promise<HabitSnapshot> {
  const snap = await getHabitSnapshot();
  const next = { date: todayKey(), items: snap.items.filter(i => i.id !== id) };
  writeLocal(next);
  return next;
}

export function formatHabitsForContext(snap: HabitSnapshot | null): string {
  if (!snap || !snap.items.length) return '';
  const parts = snap.items.map(i => `${i.label} ${i.current}/${i.goal}${i.unit === 'count' ? '' : ' ' + i.unit}`);
  return `## Daily habits (${snap.date})\n${parts.join(' · ')}`;
}
