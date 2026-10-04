/**
 * Zet de kluisboom klaar: workplace per tab, werkplek per roster-agent.
 * Bestaande notities blijven staan.
 */
import { listRecentObsidianNotes, writeObsidianNote } from '@/infrastructure/persistence/obsidianMemoryService';
import { AXE_AGENTS } from '@/domain/agents/roster';
import { workspaceVoor } from '@/domain/agents/workspace';
import { kluisPadVoorAgent, kluisPadVoorTab } from '@/domain/obsidian/kluisBoom';

const TABS = ['home', 'browser', 'agents', 'obsidian', 'tasks', 'memory'] as const;

export async function maybeSeedKluisBoom(): Promise<void> {
  let bestaande: string[] = [];
  try {
    bestaande = (await listRecentObsidianNotes(200)).map((n) => n.path);
  } catch {
    return;
  }
  const heeft = new Set(bestaande);

  for (const tab of TABS) {
    const path = kluisPadVoorTab(tab);
    if (heeft.has(path)) continue;
    await writeObsidianNote({
      path,
      title: `${tab} workplace`,
      content: [
        `# ${tab} workplace`,
        '',
        `Context for the ${tab} tab. Other tabs do not share this folder.`,
        '',
      ].join('\n'),
      tags: ['workplace', tab],
      source: 'system',
    });
  }

  for (const agent of AXE_AGENTS) {
    const path = kluisPadVoorAgent(agent.id);
    if (heeft.has(path)) continue;
    const ws = workspaceVoor(agent.id);
    await writeObsidianNote({
      path,
      title: `${agent.name} workspace`,
      content: [
        `# ${agent.name}`,
        '',
        `- role: ${ws.role}`,
        `- preferred device: ${ws.preferredDevice ?? 'any'}`,
        `- memory: ${ws.memoryScope}`,
        `- tools: ${ws.tools.join(', ')}`,
        `- crew: ${ws.crew.length ? ws.crew.join(', ') : 'none'}`,
        '',
        '## System prompt',
        '',
        ws.systemPrompt,
        '',
      ].join('\n'),
      tags: ['agent', agent.id],
      source: 'system',
    });
  }
}
