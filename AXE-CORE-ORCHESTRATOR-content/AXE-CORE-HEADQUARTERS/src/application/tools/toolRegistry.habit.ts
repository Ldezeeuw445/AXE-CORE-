import { TOOL_CATALOG, type ToolCatalogEntry } from '@/domain/tools/toolCatalog';
import {
  getHabitSnapshot,
  logHabitByLabel,
  formatHabitsForContext,
} from '@/infrastructure/persistence/habitTrackerService';

export interface HabitToolRuntime extends ToolCatalogEntry {
  available: () => boolean;
  run: (raw: string, ctx: { requestApproval: (kind: string, title: string, detail: string) => Promise<boolean> }) => Promise<string>;
  onError?: (msg: string) => string;
}

function catalogEntry(id: string): ToolCatalogEntry {
  const entry = TOOL_CATALOG.find(t => t.id === id);
  if (!entry) throw new Error(`toolRegistry.habit: no catalog entry for '${id}'`);
  return entry;
}

export const HABIT_TOOL_RUNTIMES: HabitToolRuntime[] = [
  {
    ...catalogEntry('habit_log'),
    available: () => true,
    run: async (raw) => {
      let p: { label?: string; value?: number | string };
      try {
        p = JSON.parse(raw) as { label?: string; value?: number | string };
      } catch {
        return 'HABIT_LOG failed: need JSON {"label":"...", "value": number}.';
      }
      if (!p.label) return 'HABIT_LOG failed: label is required.';
      const value = typeof p.value === 'string' ? parseFloat(p.value.replace(',', '.')) : p.value;
      if (typeof value !== 'number' || !Number.isFinite(value)) return 'HABIT_LOG failed: value must be numeric.';
      const item = await logHabitByLabel(p.label, value);
      if (!item) return `HABIT_LOG failed: no habit card matches "${p.label}".`;
      if (typeof window !== 'undefined') window.dispatchEvent(new Event('axe-habits-updated'));
      return `HABIT_LOG saved → ${item.label}: ${item.current}/${item.goal}`;
    },
    onError: (msg) => `HABIT_LOG failed: ${msg}`,
  },
  {
    ...catalogEntry('habit_status'),
    available: () => true,
    run: async () => {
      const snap = await getHabitSnapshot();
      return formatHabitsForContext(snap) || 'HABIT_STATUS: no habit cards defined.';
    },
    onError: (msg) => `HABIT_STATUS failed: ${msg}`,
  },
];
