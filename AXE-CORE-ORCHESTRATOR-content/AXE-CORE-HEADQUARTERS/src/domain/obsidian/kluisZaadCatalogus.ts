/**
 * Wat er in de kluis HOORT te staan: echte tabs, echte roster-agents,
 * echte repos, en het staande plan per bestaande app. Geen I/O, geen
 * verzonnen agents.
 */
import { AXE_AGENTS } from '@/domain/agents/roster';
import { workspaceVoor } from '@/domain/agents/workspace';
import { appPlanTekst, staandeAppPlannen } from '@/domain/appPlan';
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

export interface ZaadNotitie {
  path: string;
  title: string;
  content: string;
  tags: string[];
}

export function kluisZaadNotities(): ZaadNotitie[] {
  const uit: ZaadNotitie[] = [];

  for (const item of NAV_ITEMS) {
    const tab = tabLabelVoorKluis(item.label);
    const agent = agentVoorTab(item.label);
    const agentNaam = agent ? agentNaamVoorKluis(agent) : 'none';
    uit.push({
      path: kluisPadVoorTab(item.label),
      title: `${tab} workplace`,
      tags: ['workplace', tab],
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
    });
  }

  for (const agent of AXE_AGENTS) {
    const ws = workspaceVoor(agent.id);
    const tab = agent.route ? tabLabelVoorKluis(agent.route) : 'Home';
    uit.push({
      path: kluisPadVoorAgent(agent.id),
      title: `${agent.name} workspace`,
      tags: ['agent', agent.id],
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
    });
  }

  for (const plan of staandeAppPlannen()) {
    uit.push({
      path: plan.pad,
      title: `${plan.label} plan`,
      tags: ['plan', plan.app],
      content: appPlanTekst(plan),
    });
  }

  for (const repo of REPO_WERKPLEKKEN) {
    uit.push({
      path: kluisPadVoorRepo(repo.id),
      title: `${repo.label} workspace`,
      tags: ['repo', repo.id],
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
    });
  }

  return uit;
}

export function ontbrekendeZaadNotities(bestaandePaden: Iterable<string>): ZaadNotitie[] {
  const heeft = new Set(bestaandePaden);
  return kluisZaadNotities().filter((n) => !heeft.has(n.path));
}
