/**
 * Het rapport van een klare taak wegschrijven.
 *
 * De vorm staat puur in `domain/tierRouter/jobRapport.ts`; dit is alleen de weg
 * naar de opslag. Gescheiden omdat de vorm te testen hoort te zijn zonder een
 * database, en omdat `installTierRouter` (presentatie) niet rechtstreeks naar
 * een gateway hoort te praten.
 */
import { jobRapportVan } from '@/domain/tierRouter/jobRapport';
import type { AxeJob } from '@/domain/tierRouter/axeJobRegels';
import { remember } from '@/infrastructure/persistence/agentMemoryService';

/** Stil: een mislukte schrijfpoging mag het vertellen van het resultaat nooit
 *  tegenhouden. Het rapport is een bijproduct, niet de boodschap. */
export async function bewaarJobRapport(job: AxeJob): Promise<void> {
  const rapport = jobRapportVan(job);
  if (!rapport) return;
  try {
    await remember({
      kind: 'doc',
      category: 'projects',
      key: rapport.sleutel,
      content: rapport.inhoud,
      tags: rapport.tags,
      source: 'jobRapport',
    });
  } catch (err) {
    console.warn('[AXE] rapport niet bewaard:', err);
  }
}
