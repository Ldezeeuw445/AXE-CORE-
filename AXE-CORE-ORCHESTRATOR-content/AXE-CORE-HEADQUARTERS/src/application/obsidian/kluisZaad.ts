/**
 * Zet de kluisboom klaar: workplace per tab, werkplek per roster-agent,
 * workspace per repo. Bestaande notities blijven staan.
 */
import { listRecentObsidianNotes, writeObsidianNote } from '@/infrastructure/persistence/obsidianMemoryService';
import { AXE_AGENTS } from '@/domain/agents/roster';
import { workspaceVoor } from '@/domain/agents/workspace';
import { NAV_ITEMS } from '@/domain/navRegistry';
import {
  kluisPadVoorAgent,
  kluisPadVoorRepo,
  kluisPadVoorTab,
} from '@/domain/obsidian/kluisBoom';
import {
  REPO_WERKPLEKKEN,
  WIE_WERKT,
  agentNaamVoorKluis,
  agentVoorTab,
  tabLabelVoorKluis,
} from '@/domain/obsidian/werkplek';

export async function maybeSeedKluisBoom(): Promise<void> {
  let paden: string[];
  try {
    paden = (await listRecentObsidianNotes(400)).map((n) => n.path);
  } catch {
    return;
  }
  const heeft = new Set(paden);

  for (const item of NAV_ITEMS) {
    const tab = tabLabelVoorKluis(item.label);
    const path = kluisPadVoorTab(item.label);
    if (heeft.has(path)) continue;
    const agent = agentVoorTab(item.label);
    const agentNaam = agent ? agentNaamVoorKluis(agent) : 'none';
    await writeObsidianNote({
      path,
      title: `${tab} workplace`,
      content: [
        `# ${tab}`,
        '',
        `- kind: tab`,
        `- tab: ${tab}`,
        `- agent: ${agentNaam}`,
        `- repo: none`,
        `- who: ${WIE_WERKT} · whoever is working this tab`,
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
    const tab = agent.route ? tabLabelVoorKluis(agent.route) : 'Home';
    await writeObsidianNote({
      path,
      title: `${agent.name} workspace`,
      content: [
        `# ${agent.name}`,
        '',
        `- kind: agent`,
        `- tab: ${tab}`,
        `- agent: ${agent.name}`,
        `- repo: none`,
        `- who: ${agent.name}`,
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

  for (const repo of REPO_WERKPLEKKEN) {
    const path = kluisPadVoorRepo(repo.id);
    if (heeft.has(path)) continue;
    await writeObsidianNote({
      path,
      title: `${repo.label} workspace`,
      content: [
        `# ${repo.label}`,
        '',
        `- kind: repo`,
        `- tab: Code Editor`,
        `- agent: AXE Developer`,
        `- repo: ${repo.owner}/${repo.repo}`,
        `- branch: ${repo.branch}`,
        `- who: ${WIE_WERKT} · AXE Developer`,
        '',
        `Code and project work for ${repo.label}. Agents that touch this repo write here.`,
        '',
      ].join('\n'),
      tags: ['repo', repo.id],
      source: 'system',
    });
  }
}
