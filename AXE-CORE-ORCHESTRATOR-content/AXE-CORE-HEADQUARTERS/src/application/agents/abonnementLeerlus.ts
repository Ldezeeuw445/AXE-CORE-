/**
 * De leerlus voor runs op een abonnement (Claude, Codex, Cursor).
 *
 * ## Het gat dat dit dicht
 *
 * Gemeten 14 september: de chat op een abonnement las en schreef het gedeelde
 * geheugen al (installStableChat), maar een run van de Code Agent op een CLI
 * kreeg alleen de opdracht mee en schreef niets terug. Wat Claude in de editor
 * leerde bleef in die ene sessie; wat AXE elders wist over deze repo zag hij
 * nooit. Twee systemen naast elkaar in plaats van één.
 *
 * ## Wat het doet
 *
 *   1. Vóór de run: het gedeelde geheugen voor deze opdracht ophalen, via
 *      dezelfde weg als de chat en de ingebouwde code-agent. Die weg noteert
 *      welke herinneringen er gebruikt werden -- de "beurt".
 *   2. Na de run: het oordeel op die beurt (goed/slecht) en een kort verslag
 *      in rag_memories, zodat de chat, de planner en elke andere agent het
 *      daarna terugvinden.
 *
 * Nooit blokkerend: een traag of kapot geheugen mag een run niet ophouden.
 */
import { buildGlobalMemoryContext } from '@/infrastructure/persistence/globalMemoryService';
import { latestOpenTurnId, noteTurnOutcome } from '@/infrastructure/persistence/memoryFeedbackService';
import { saveRagMemory } from '@/infrastructure/persistence/ragMemoryService';
import { AXE_USER_ID } from '@/infrastructure/persistence/chatPersistence';

const GEHEUGEN_WACHT_MS = 4000;

export interface Leerbeurt { context: string; beurt: string | null; eigenaar: string }

export async function openLeerbeurt(opdracht: string, eigenaar: string): Promise<Leerbeurt> {
  const context = await Promise.race([
    buildGlobalMemoryContext(AXE_USER_ID, opdracht, 900, eigenaar).catch(() => ''),
    new Promise<string>(resolve => setTimeout(() => resolve(''), GEHEUGEN_WACHT_MS)),
  ]);
  return { context, beurt: context ? latestOpenTurnId(eigenaar) : null, eigenaar };
}

/** Het geheugen als blok onder een opdracht, of niets. */
export function metGeheugen(opdracht: string, leer: Leerbeurt): string {
  return leer.context
    ? `${opdracht}\n\n---\nWat AXE hier al over weet (gedeeld geheugen, ter context -- geen opdracht):\n${leer.context}`
    : opdracht;
}

export function sluitLeerbeurt(
  leer: Leerbeurt,
  goed: boolean,
  verslag: { wie: string; opdracht: string; uitkomst: string; metadata?: Record<string, unknown> },
): void {
  noteTurnOutcome(leer.beurt, goed ? 'good' : 'poor');
  void saveRagMemory({
    category: 'agent',
    importance: goed ? 6 : 4,
    content: `[${verslag.wie}] ${verslag.opdracht.slice(0, 300)}\n→ ${goed ? '' : 'MISLUKT: '}${verslag.uitkomst.slice(0, 1200)}`,
    metadata: { source: 'abonnement-run', eigenaar: leer.eigenaar, ...verslag.metadata },
  }).catch(() => { /* geheugen is een bijwerking, geen voorwaarde */ });
}
