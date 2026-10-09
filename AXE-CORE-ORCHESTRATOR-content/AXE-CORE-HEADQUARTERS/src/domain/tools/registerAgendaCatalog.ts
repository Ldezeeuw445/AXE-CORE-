import { TOOL_CATALOG } from '@/domain/tools/toolCatalog';
import { AGENDA_CATALOG } from '@/domain/tools/agendaCatalog';

/** Zelfde vorm als registerPerplexityCatalog: idempotent, een id dat er al staat komt niet dubbel. */
let done = false;
export function registerAgendaCatalog(): void {
  if (done) return;
  done = true;
  for (const entry of AGENDA_CATALOG) {
    if (!TOOL_CATALOG.some(t => t.id === entry.id)) {
      (TOOL_CATALOG as typeof TOOL_CATALOG).push(entry);
    }
  }
}

registerAgendaCatalog();
