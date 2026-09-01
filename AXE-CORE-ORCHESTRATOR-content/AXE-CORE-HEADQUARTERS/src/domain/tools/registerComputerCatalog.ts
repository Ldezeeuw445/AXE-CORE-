import { TOOL_CATALOG } from '@/domain/tools/toolCatalog';
import { COMPUTER_CATALOG } from '@/domain/tools/computerCatalog';

/**
 * Mirrors registerMacCatalog / registerSmartThingsCatalog exactly: idempotent,
 * self-invoking on import, and a no-op if an id is already present.
 *
 * Order note: TOOL_CATALOG resolves the FIRST matching entry per round, and
 * these are appended, so the existing search/fetch/exec priority is untouched.
 */
let done = false;
export function registerComputerCatalog(): void {
  if (done) return;
  done = true;
  for (const entry of COMPUTER_CATALOG) {
    if (!TOOL_CATALOG.some(t => t.id === entry.id)) {
      (TOOL_CATALOG as typeof TOOL_CATALOG).push(entry);
    }
  }
}

registerComputerCatalog();
