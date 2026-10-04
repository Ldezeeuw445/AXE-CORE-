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

/** Eén regel voor morgen in de AXE Algo-werkplek. Geen order, geen auto-send. */
export function algoVolgendeDagTekst(samenvatting: string[]): string {
  const regels = samenvatting.map(s => s.trim()).filter(Boolean);
  if (!regels.length) {
    return 'Last cycle recorded nothing. Next: confirm the MetaAPI token and that the MT5 accounts are deployed on the machine that holds the lease. No order is sent until that account answers with a price.';
  }
  const blokkers = regels.filter(s => /no broker price|not confirmed|unavailable|HOLD/i.test(s));
  const kop = blokkers.length
    ? `Last cycle decided on ${regels.length} symbol(s) and sent no order.`
    : `Last cycle: ${regels.length} symbol(s).`;
  return `${kop} ${regels.slice(0, 6).join(' · ').slice(0, 500)} Next: keep the same account and the same decision log — do not raise risk limits.`;
}

export async function schrijfAlgoVolgendeDag(samenvatting: string[]): Promise<void> {
  const dag = new Date().toISOString().slice(0, 10);
  await schrijfInAgentWerkplek(
    'trading',
    `Next day ${dag}`,
    algoVolgendeDagTekst(samenvatting),
    'nightly',
  );
}

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
