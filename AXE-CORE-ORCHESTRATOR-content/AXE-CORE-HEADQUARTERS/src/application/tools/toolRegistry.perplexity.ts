/**
 * toolRegistry.perplexity.ts -- [RESEARCH:] in de chat.
 *
 * De runtime is dun met opzet: het gesprek met de VPS staat in
 * perplexityResearchService, het lezen van het antwoord en het benoemen van een
 * fout in domain/perplexityAgent. Hier alleen de vertaling naar een zin die het
 * model verder kan gebruiken -- inclusief bij een fout, want een model dat
 * "Perplexity faalde" krijgt, gokt anders zelf een antwoord.
 */
import { TOOL_CATALOG, type ToolCatalogEntry } from '@/domain/tools/toolCatalog';
import { formatteerFout, formatteerOnderzoek } from '@/domain/perplexityAgent';
import { perplexityResearch } from '@/infrastructure/gateways/perplexityResearchService';

export interface PerplexityToolRuntime extends ToolCatalogEntry {
  available: () => boolean;
  run: (raw: string) => Promise<string>;
  onError?: (msg: string) => string;
}

function catalogEntry(id: string): ToolCatalogEntry {
  const entry = TOOL_CATALOG.find(t => t.id === id);
  if (!entry) throw new Error(`toolRegistry.perplexity: no catalog entry for '${id}'`);
  return entry;
}

export const PERPLEXITY_TOOL_RUNTIMES: PerplexityToolRuntime[] = [
  {
    ...catalogEntry('research'),
    // Altijd beschikbaar: of de server een sleutel heeft weet alleen de server,
    // en die zegt het zelf (503) -- formatteerFout maakt daar een eerlijke zin van.
    available: () => true,
    run: async (raw) => {
      const vraag = raw.trim();
      const uitkomst = await perplexityResearch(vraag, { preset: 'low' });
      return uitkomst.ok ? formatteerOnderzoek(uitkomst.result, vraag) : formatteerFout(uitkomst);
    },
    onError: (msg) => `Perplexity research failed: ${msg}. Report this rather than guessing an answer.`,
  },
];
