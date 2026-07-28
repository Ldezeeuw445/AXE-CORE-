/** Side-effect import: append SmartThings tools to TOOL_CATALOG once. */
import { TOOL_CATALOG } from '@/domain/tools/toolCatalog';
import { SMARTTHINGS_CATALOG } from '@/domain/tools/smartThingsCatalog';

let done = false;
export function registerSmartThingsCatalog(): void {
  if (done) return;
  done = true;
  for (const entry of SMARTTHINGS_CATALOG) {
    if (!TOOL_CATALOG.some(t => t.id === entry.id)) {
      (TOOL_CATALOG as typeof TOOL_CATALOG).push(entry);
    }
  }
}

registerSmartThingsCatalog();
