/**
 * ringSnapshotService — latest smart-ring vitals for the Home right panel.
 *
 * Da Rings (MO YOUNG) has no public cloud API. Data is logged from the app
 * (manual or via chat [RING_LOG:]). Widget auto-refreshes from this store.
 */

import { saveSetting, loadSetting } from '@/infrastructure/persistence/userSettingsService';

export interface RingSnapshot {
  steps?: number;
  heartRate?: number;
  spo2?: number;
  hrv?: number;
  stress?: number;
  calories?: number;
  sleepScore?: number;
  sleepHours?: number;
  battery?: number;
  temperature?: number;
  note?: string;
  /** ISO timestamp when this snapshot was recorded */
  updatedAt: string;
  source?: string;
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

export async function getRingSnapshot(): Promise<RingSnapshot | null> {
  const cloud = await loadSetting<RingSnapshot | null>(LS_KEY, null);
  if (cloud && cloud.updatedAt) {
    localStorage.setItem(LS_KEY, JSON.stringify(cloud));
    return cloud;
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
  };
  writeLocal(next);
  return next;
}

export function formatRingForContext(s: RingSnapshot | null): string {
  if (!s) return '';
  const parts: string[] = [];
  if (s.steps != null) parts.push(`steps ${s.steps}`);
  if (s.heartRate != null) parts.push(`HR ${s.heartRate}`);
  if (s.spo2 != null) parts.push(`SpO2 ${s.spo2}%`);
  if (s.hrv != null) parts.push(`HRV ${s.hrv}`);
  if (s.stress != null) parts.push(`stress ${s.stress}`);
  if (s.calories != null) parts.push(`kcal ${s.calories}`);
  if (s.sleepScore != null) parts.push(`sleep score ${s.sleepScore}`);
  if (s.sleepHours != null) parts.push(`sleep ${s.sleepHours}h`);
  if (s.battery != null) parts.push(`battery ${s.battery}%`);
  if (!parts.length) return '';
  return `## Smart ring (${s.source || 'Da Rings'})\nUpdated ${s.updatedAt}\n${parts.join(' · ')}`;
}
