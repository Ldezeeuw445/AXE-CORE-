import { TOOL_CATALOG } from '@/domain/tools/toolCatalog';
import { MAC_CATALOG } from '@/domain/tools/macCatalog';

let done = false;
export function registerMacCatalog(): void {
  if (done) return;
  done = true;
  for (const entry of MAC_CATALOG) {
    if (!TOOL_CATALOG.some(t => t.id === entry.id)) {
      (TOOL_CATALOG as typeof TOOL_CATALOG).push(entry);
    }
  }
}

registerMacCatalog();
