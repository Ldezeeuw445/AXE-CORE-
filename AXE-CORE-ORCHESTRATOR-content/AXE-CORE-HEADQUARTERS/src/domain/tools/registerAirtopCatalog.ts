import { TOOL_CATALOG } from '@/domain/tools/toolCatalog';
import { AIRTOP_CATALOG } from '@/domain/tools/airtopCatalog';

let done = false;
export function registerAirtopCatalog(): void {
  if (done) return;
  done = true;
  for (const entry of AIRTOP_CATALOG) {
    if (!TOOL_CATALOG.some(t => t.id === entry.id)) {
      (TOOL_CATALOG as typeof TOOL_CATALOG).push(entry);
    }
  }
}

registerAirtopCatalog();
