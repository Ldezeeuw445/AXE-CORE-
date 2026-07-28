import { TOOL_CATALOG } from '@/domain/tools/toolCatalog';
import { RING_CATALOG } from '@/domain/tools/ringCatalog';

let done = false;
export function registerRingCatalog(): void {
  if (done) return;
  done = true;
  for (const entry of RING_CATALOG) {
    if (!TOOL_CATALOG.some(t => t.id === entry.id)) {
      (TOOL_CATALOG as typeof TOOL_CATALOG).push(entry);
    }
  }
}

registerRingCatalog();
