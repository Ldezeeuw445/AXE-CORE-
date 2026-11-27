/** Widgets tab logic (focus timer, note). Local tools only, no network. */

export const FOCUS_MIN = 5;
export const FOCUS_MAX = 90;
export const FOCUS_STEP = 5;
export const FOCUS_DEFAULT = 25;
export const NOTE_KEY = "axe.notch.note";

export function clampFocus(minutes: number): number {
  if (!Number.isFinite(minutes)) return FOCUS_DEFAULT;
  return Math.min(FOCUS_MAX, Math.max(FOCUS_MIN, Math.round(minutes / FOCUS_STEP) * FOCUS_STEP));
}

export function formatClock(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  const m = Math.floor(s / 60);
  return `${String(m).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
}

export function wordCount(text: string): number {
  const t = text.trim();
  return t ? t.split(/\s+/).length : 0;
}
