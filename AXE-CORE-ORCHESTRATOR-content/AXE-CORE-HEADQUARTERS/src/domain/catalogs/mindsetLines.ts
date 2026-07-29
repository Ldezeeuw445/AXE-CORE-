/**
 * Mindset quotes — fully user-owned.
 * Stored in localStorage (axe_mindset_quotes) and synced via saveSetting.
 * The Mindset button rotates through YOUR list only.
 */
import { saveSetting } from '@/infrastructure/persistence/userSettingsService';

const QUOTES_KEY = 'axe_mindset_quotes';
const INDEX_KEY = 'axe_mindset_index';

function sanitize(lines: unknown): string[] {
  if (!Array.isArray(lines)) return [];
  return lines
    .map(l => (typeof l === 'string' ? l.trim() : ''))
    .filter(l => l.length > 0)
    .slice(0, 200);
}

/** Load quotes from localStorage. Empty until the user adds some in Settings. */
export function getMindsetQuotes(): string[] {
  try {
    const raw = localStorage.getItem(QUOTES_KEY);
    if (!raw) return [];
    return sanitize(JSON.parse(raw));
  } catch {
    return [];
  }
}

/** Replace the full list and persist (local + Supabase settings). */
export function setMindsetQuotes(lines: string[]): void {
  const clean = sanitize(lines);
  try {
    localStorage.setItem(QUOTES_KEY, JSON.stringify(clean));
    // Reset rotation when the list changes so we don't point past the end.
    localStorage.setItem(INDEX_KEY, '0');
  } catch { /* ignore */ }
  void saveSetting(QUOTES_KEY, clean);
}

export function addMindsetQuote(line: string): string[] {
  const t = line.trim();
  if (!t) return getMindsetQuotes();
  const next = [...getMindsetQuotes(), t].slice(0, 200);
  setMindsetQuotes(next);
  return next;
}

export function removeMindsetQuote(index: number): string[] {
  const cur = getMindsetQuotes();
  if (index < 0 || index >= cur.length) return cur;
  const next = cur.filter((_, i) => i !== index);
  setMindsetQuotes(next);
  return next;
}

/**
 * Next quote in rotation. Returns null if the user has no quotes yet.
 */
export function nextMindsetLine(): string | null {
  const lines = getMindsetQuotes();
  if (lines.length === 0) return null;
  let i = 0;
  try {
    i = Number(localStorage.getItem(INDEX_KEY) ?? '0') || 0;
  } catch { /* ignore */ }
  const line = lines[i % lines.length]!;
  try {
    localStorage.setItem(INDEX_KEY, String((i + 1) % lines.length));
  } catch { /* ignore */ }
  return line;
}

/** @deprecated kept so old imports don't break; prefer getMindsetQuotes() */
export const MINDSET_LINES: string[] = [];
