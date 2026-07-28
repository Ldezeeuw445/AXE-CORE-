import { TOOL_CATALOG } from '@/domain/tools/toolCatalog';
import { BROWSER_AGENT_CATALOG } from '@/domain/tools/browserAgentCatalog';

let done = false;
export function registerBrowserAgentCatalog(): void {
  if (done) return;
  done = true;
  for (const entry of BROWSER_AGENT_CATALOG) {
    if (!TOOL_CATALOG.some(t => t.id === entry.id)) {
      (TOOL_CATALOG as typeof TOOL_CATALOG).push(entry);
    }
  }
}

registerBrowserAgentCatalog();
