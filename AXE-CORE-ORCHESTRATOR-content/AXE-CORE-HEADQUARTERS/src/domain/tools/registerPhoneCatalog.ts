import { TOOL_CATALOG } from '@/domain/tools/toolCatalog';
import { PHONE_CATALOG } from '@/domain/tools/phoneCatalog';

let done = false;
export function registerPhoneCatalog(): void {
  if (done) return;
  done = true;
  for (const entry of PHONE_CATALOG) {
    if (!TOOL_CATALOG.some(t => t.id === entry.id)) {
      (TOOL_CATALOG as typeof TOOL_CATALOG).push(entry);
    }
  }
}

registerPhoneCatalog();
