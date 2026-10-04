/**
 * Eén les in de bestaande agent-werkplek. Geen nieuwe taak, geen mail.
 */
import { getObsidianNoteByPath, writeObsidianNote } from '@/infrastructure/persistence/obsidianMemoryService';
import { kluisPadVoorAgent } from '@/domain/obsidian/kluisBoom';
import { agentNaamVoorKluis } from '@/domain/obsidian/werkplek';
import { volgendeStapMagDoor } from '@/domain/werkBron';

const PLANNER_NAAR_ROSTER: Record<string, string> = {
  'axe-core': 'axe',
  'code-agent': 'developer',
  'axe-algo': 'trading',
  'maps-agent': 'northsea',
};

export async function schrijfInAgentWerkplek(
  agent: string,
  kop: string,
  tekst: string,
  oorsprong: 'nightly' | 'planner' = 'nightly',
): Promise<void> {
  const check = volgendeStapMagDoor(`${kop}\n${tekst}`);
  const body = check.door ? tekst : (check.vraag ?? 'This would send a message. It stops here until you say so.');
  const rosterId = PLANNER_NAAR_ROSTER[agent] ?? agent;
  const path = kluisPadVoorAgent(rosterId);
  const existing = await getObsidianNoteByPath(path).catch(() => null);
  const huidig = existing?.content ?? `# ${agentNaamVoorKluis(rosterId)}\n`;
  if (huidig.includes(`## ${kop}`)) return;
  try {
    await writeObsidianNote({
      path,
      title: existing?.title ?? `${agentNaamVoorKluis(rosterId)} workspace`,
      content: `${huidig.trimEnd()}\n\n## ${kop}\n\n${body}\n`,
      tags: ['agent', oorsprong],
      source: 'axe',
      metadata: { oorsprong },
    });
  } catch {
    /* kluis schrijven is best-effort */
  }
}
