import { TOOL_CATALOG } from '@/domain/tools/toolCatalog';
import { PERPLEXITY_CATALOG } from '@/domain/tools/perplexityCatalog';

/** Zelfde vorm als registerBrowserAgentCatalog: idempotent, en een id dat er al
 *  staat wordt niet dubbel toegevoegd. */
let done = false;
export function registerPerplexityCatalog(): void {
  if (done) return;
  done = true;
  for (const entry of PERPLEXITY_CATALOG) {
    if (!TOOL_CATALOG.some(t => t.id === entry.id)) {
      (TOOL_CATALOG as typeof TOOL_CATALOG).push(entry);
    }
  }
}

registerPerplexityCatalog();
