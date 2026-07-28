/**
 * incomeLedgerService — personal income log for AXE CORE.
 * Manual entries only (you log what you earned). AXE can summarize this
 * for "what did I make this month?" style questions later via context.
 */

import { saveSetting, loadSetting } from '@/infrastructure/persistence/userSettingsService';

export type IncomeSource =
  | 'prime_opinion'
  | 'trading'
  | 'apps'
  | 'freelance'
  | 'salary'
  | 'crypto'
  | 'other';

export interface IncomeEntry {
  id: string;
  source: IncomeSource;
  amount: number;
  currency: string;
  /** ISO date YYYY-MM-DD */
  date: string;
  note?: string;
  /** Optional: surveys completed in this log (Prime Opinion etc.) */
  units?: number;
  created_at: string;
}

const LS_KEY = 'axe_income_ledger';

export const INCOME_SOURCES: { id: IncomeSource; label: string; color: string }[] = [
  { id: 'prime_opinion', label: 'Prime Opinion', color: '#22D3EE' },
  { id: 'trading', label: 'Trading', color: '#10B981' },
  { id: 'apps', label: 'Apps / products', color: '#A78BFA' },
  { id: 'freelance', label: 'Freelance', color: '#F59E0B' },
  { id: 'salary', label: 'Salary', color: '#3B82F6' },
  { id: 'crypto', label: 'Crypto', color: '#EC4899' },
  { id: 'other', label: 'Other', color: '#94A3B8' },
];

function loadLocal(): IncomeEntry[] {
  try {
    const raw = JSON.parse(localStorage.getItem(LS_KEY) || '[]');
    return Array.isArray(raw) ? raw : [];
  } catch {
    return [];
  }
}

function saveLocal(entries: IncomeEntry[]): void {
  localStorage.setItem(LS_KEY, JSON.stringify(entries));
  void saveSetting(LS_KEY, entries);
}

export async function listIncomeEntries(): Promise<IncomeEntry[]> {
  const fromCloud = await loadSetting<IncomeEntry[]>(LS_KEY, []);
  if (Array.isArray(fromCloud) && fromCloud.length > 0) {
    localStorage.setItem(LS_KEY, JSON.stringify(fromCloud));
    return [...fromCloud].sort((a, b) => b.date.localeCompare(a.date) || b.created_at.localeCompare(a.created_at));
  }
  return loadLocal().sort((a, b) => b.date.localeCompare(a.date) || b.created_at.localeCompare(a.created_at));
}

export async function addIncomeEntry(input: {
  source: IncomeSource;
  amount: number;
  currency?: string;
  date?: string;
  note?: string;
  units?: number;
}): Promise<IncomeEntry> {
  const entry: IncomeEntry = {
    id: crypto.randomUUID?.() ?? `inc-${Date.now()}`,
    source: input.source,
    amount: Number(input.amount) || 0,
    currency: (input.currency || 'EUR').toUpperCase(),
    date: input.date || new Date().toISOString().slice(0, 10),
    note: input.note?.trim() || undefined,
    units: input.units != null && input.units > 0 ? input.units : undefined,
    created_at: new Date().toISOString(),
  };
  const all = await listIncomeEntries();
  all.unshift(entry);
  saveLocal(all);
  return entry;
}

export async function deleteIncomeEntry(id: string): Promise<void> {
  const all = (await listIncomeEntries()).filter(e => e.id !== id);
  saveLocal(all);
}

export interface IncomeSummary {
  total: number;
  bySource: Record<string, { amount: number; count: number; units: number }>;
  thisMonth: number;
  thisMonthUnits: number;
  currency: string;
}

export function summarizeIncome(entries: IncomeEntry[], currency = 'EUR'): IncomeSummary {
  const monthPrefix = new Date().toISOString().slice(0, 7);
  const bySource: IncomeSummary['bySource'] = {};
  let total = 0;
  let thisMonth = 0;
  let thisMonthUnits = 0;

  for (const e of entries) {
    if (e.currency !== currency && currency !== 'ALL') continue;
    const amt = e.amount;
    total += amt;
    if (!bySource[e.source]) bySource[e.source] = { amount: 0, count: 0, units: 0 };
    bySource[e.source].amount += amt;
    bySource[e.source].count += 1;
    bySource[e.source].units += e.units ?? 0;
    if (e.date.startsWith(monthPrefix)) {
      thisMonth += amt;
      thisMonthUnits += e.units ?? 0;
    }
  }

  return { total, bySource, thisMonth, thisMonthUnits, currency };
}

/** Short text for AXE chat context. */
export function formatIncomeForContext(entries: IncomeEntry[], max = 15): string {
  if (!entries.length) return '';
  const sum = summarizeIncome(entries);
  const lines = entries.slice(0, max).map(e => {
    const src = INCOME_SOURCES.find(s => s.id === e.source)?.label ?? e.source;
    return `- ${e.date} ${src}: ${e.amount} ${e.currency}${e.units ? ` (${e.units} units)` : ''}${e.note ? ` — ${e.note}` : ''}`;
  });
  return `## Income ledger\nThis month: ${sum.thisMonth.toFixed(2)} ${sum.currency}` +
    (sum.thisMonthUnits ? ` · ${sum.thisMonthUnits} survey units` : '') +
    `\nAll-time (EUR filter): ${sum.total.toFixed(2)}\n` +
    lines.join('\n');
}
