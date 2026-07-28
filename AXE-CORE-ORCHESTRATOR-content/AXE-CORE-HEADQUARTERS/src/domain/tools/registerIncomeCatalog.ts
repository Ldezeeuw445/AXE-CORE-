/** Side-effect import: append income tools to TOOL_CATALOG once. */
import { TOOL_CATALOG } from '@/domain/tools/toolCatalog';
import { INCOME_CATALOG } from '@/domain/tools/incomeCatalog';

let done = false;
export function registerIncomeCatalog(): void {
  if (done) return;
  done = true;
  for (const entry of INCOME_CATALOG) {
    if (!TOOL_CATALOG.some(t => t.id === entry.id)) {
      (TOOL_CATALOG as typeof TOOL_CATALOG).push(entry);
    }
  }
}

registerIncomeCatalog();
