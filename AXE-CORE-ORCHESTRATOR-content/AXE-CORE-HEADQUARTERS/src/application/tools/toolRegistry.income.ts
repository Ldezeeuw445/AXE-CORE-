/** Income ledger tool runtimes. */
import { TOOL_CATALOG, type ToolCatalogEntry } from '@/domain/tools/toolCatalog';
import {
  addIncomeEntry,
  listIncomeEntries,
  summarizeIncome,
  INCOME_SOURCES,
  type IncomeSource,
} from '@/infrastructure/persistence/incomeLedgerService';

export interface IncomeToolRuntime extends ToolCatalogEntry {
  available: () => boolean;
  run: (raw: string, ctx: { requestApproval: (kind: string, title: string, detail: string) => Promise<boolean> }) => Promise<string>;
  onError?: (msg: string) => string;
}

function catalogEntry(id: string): ToolCatalogEntry {
  const entry = TOOL_CATALOG.find(t => t.id === id);
  if (!entry) throw new Error(`toolRegistry.income: no catalog entry for '${id}'`);
  return entry;
}

const VALID_SOURCES = new Set(INCOME_SOURCES.map(s => s.id));

export const INCOME_TOOL_RUNTIMES: IncomeToolRuntime[] = [
  {
    ...catalogEntry('income_log'),
    available: () => true,
    run: async (raw) => {
      let source: IncomeSource = 'other';
      let amount = 0;
      let currency = 'EUR';
      let date: string | undefined;
      let note: string | undefined;
      let units: number | undefined;
      try {
        const p = JSON.parse(raw) as Record<string, unknown>;
        if (typeof p.source === 'string' && VALID_SOURCES.has(p.source as IncomeSource)) {
          source = p.source as IncomeSource;
        } else if (typeof p.source === 'string') {
          return `INCOME_LOG failed: unknown source "${p.source}". Use: ${[...VALID_SOURCES].join(', ')}`;
        }
        amount = typeof p.amount === 'number' ? p.amount : parseFloat(String(p.amount ?? ''));
        if (typeof p.currency === 'string' && p.currency.trim()) currency = p.currency.trim().toUpperCase();
        if (typeof p.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(p.date)) date = p.date;
        if (typeof p.note === 'string') note = p.note.trim();
        if (typeof p.units === 'number') units = p.units;
        else if (p.units != null) units = parseInt(String(p.units), 10);
      } catch {
        return 'INCOME_LOG failed: need JSON {"source","amount"} (currency/date/note/units optional).';
      }
      if (!Number.isFinite(amount) || amount === 0) {
        return 'INCOME_LOG failed: amount must be a non-zero number.';
      }
      const entry = await addIncomeEntry({ source, amount, currency, date, note, units });
      const label = INCOME_SOURCES.find(s => s.id === source)?.label ?? source;
      return `INCOME_LOG saved → ${entry.date} ${label}: ${entry.amount} ${entry.currency}` +
        (entry.units != null ? ` (${entry.units} units)` : '') +
        (entry.note ? ` — ${entry.note}` : '') +
        ` [id=${entry.id}]`;
    },
    onError: (msg) => `INCOME_LOG failed: ${msg}`,
  },
  {
    ...catalogEntry('income_summary'),
    available: () => true,
    run: async () => {
      const entries = await listIncomeEntries();
      if (!entries.length) return 'INCOME_SUMMARY: ledger is empty — nothing logged yet.';
      const sum = summarizeIncome(entries, 'EUR');
      const lines = INCOME_SOURCES
        .filter(s => sum.bySource[s.id])
        .map(s => {
          const b = sum.bySource[s.id];
          return `- ${s.label}: ${b.amount.toFixed(2)} EUR (${b.count} logs` +
            (b.units ? `, ${b.units} units` : '') + ')';
        });
      return `INCOME_SUMMARY\nThis month: ${sum.thisMonth.toFixed(2)} EUR` +
        (sum.thisMonthUnits ? ` · ${sum.thisMonthUnits} survey units` : '') +
        `\nAll-time (EUR): ${sum.total.toFixed(2)}\nBy source:\n${lines.join('\n')}`;
    },
    onError: (msg) => `INCOME_SUMMARY failed: ${msg}`,
  },
];
