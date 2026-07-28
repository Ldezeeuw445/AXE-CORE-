import { TOOL_CATALOG } from '@/domain/tools/toolCatalog';
import { HABIT_CATALOG } from '@/domain/tools/habitCatalog';

let done = false;
export function registerHabitCatalog(): void {
  if (done) return;
  done = true;
  for (const entry of HABIT_CATALOG) {
    if (!TOOL_CATALOG.some(t => t.id === entry.id)) {
      (TOOL_CATALOG as typeof TOOL_CATALOG).push(entry);
    }
  }
}

registerHabitCatalog();
