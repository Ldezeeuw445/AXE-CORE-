/**
 * Welke soorten herinnering er zijn.
 *
 * Stond in `infrastructure/persistence/agentMemoryService.ts`, naast de code die
 * naar de tabel schrijft. Dat werkte tot iets in het domein het ook nodig had
 * (`mappen.ts`, 1 okt 2026): domein mag alleen domein en shared importeren, dus
 * een domeinbestand kon de soort niet noemen zonder de laagregel te breken.
 *
 * Het hoort hier ook thuis: welke soorten er bestaan is een afspraak over wat
 * AXE onthoudt, niet een detail van hoe het wordt opgeslagen. De kolom zelf
 * staat in `infra/migrations/001_unified_memory.sql`.
 *
 * Met opzet klein gehouden. Vier soorten die je uit elkaar kunt houden is
 * bruikbaar; twintig wordt een tweede categorie-veld.
 */
export type MemoryKind = 'fact' | 'lesson' | 'event' | 'doc';

export const MEMORY_KINDS: readonly MemoryKind[] = ['fact', 'lesson', 'event', 'doc'];
