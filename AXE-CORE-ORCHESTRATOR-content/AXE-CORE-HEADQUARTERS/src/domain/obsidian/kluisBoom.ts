/**
 * De echte kluisboom: workplaces, agentmappen, taakmappen, repo-workspaces.
 *
 * Mappen hebben de naam die een mens leest — NorthSea Desk Manager, niet
 * `northsea`. Een taak woont onder zijn agent. Geen I/O hier.
 */
import type { AxeAgentId } from '@/domain/agents/roster';
import type { PlanDevice } from '@/domain/tierRouter/beurtPlan';
import {
  WIE_WERKT,
  agentNaamVoorKluis,
  kluisMapNaam,
  repoNaamVoorKluis,
  tabLabelVoorKluis,
} from '@/domain/obsidian/werkplek';

export type KluisTak = 'workplaces' | 'agents' | 'tasks' | 'repos' | 'memory';

export const KLUIS_TAKKEN: readonly KluisTak[] = [
  'workplaces', 'agents', 'tasks', 'repos', 'memory',
];

function slugVoorKluis(raw: string): string {
  const s = (raw || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
  return s || 'untitled';
}

/** Tab uit een pad: "/" → home, "/browser" → browser. Geen gedeelde bak. */
export function tabVanPad(pathname: string): string {
  const p = (pathname || '/').split('?')[0].replace(/\/+$/, '') || '/';
  if (p === '/') return 'home';
  return slugVoorKluis(p.slice(1).split('/')[0] || 'home');
}

export function kluisPadVoorTab(tab: string): string {
  return `AXE/Workplaces/${kluisMapNaam(tabLabelVoorKluis(tab))}/context.md`;
}

export function kluisPadVoorAgent(agent: AxeAgentId | string): string {
  return `AXE/Agents/${agentNaamVoorKluis(agent)}/workspace.md`;
}

export function kluisPadVoorRepo(repoId: string): string {
  return `AXE/Repos/${repoNaamVoorKluis(repoId)}/workspace.md`;
}

/** Taak onder de agent die hem doet. Zonder agent blijft hij in de oude bak. */
export function kluisPadVoorTaak(taskId: string, agent?: AxeAgentId | string): string {
  const id = slugVoorKluis(taskId);
  if (!agent) return `AXE/Tasks/${id}/task.md`;
  return `AXE/Agents/${agentNaamVoorKluis(agent)}/Tasks/${id}/task.md`;
}

export function kluisTakVan(path: string): KluisTak {
  const p = (path || '').replace(/^\/+/, '');
  if (p.includes('/Tasks/') || p.startsWith('AXE/Tasks/')) return 'tasks';
  if (p.startsWith('AXE/Workplaces/')) return 'workplaces';
  if (p.startsWith('AXE/Repos/')) return 'repos';
  if (p.startsWith('AXE/Agents/')) return 'agents';
  return 'memory';
}

export function kluisTakLabel(tak: KluisTak): string {
  switch (tak) {
    case 'workplaces': return 'Workplaces';
    case 'agents': return 'Agents';
    case 'tasks': return 'Tasks';
    case 'repos': return 'Repos';
    default: return 'Memory';
  }
}

/** De map onder de tak: welke tab, welke agent, welke repo. */
export function kluisGroepVan(path: string): string {
  const delen = (path || '').replace(/^\/+/, '').replace(/^AXE\//, '').split('/').filter(Boolean);
  if (delen[0] === 'Agents' && delen[2] === 'Tasks') return delen[1] || 'Agents';
  if (delen.length >= 2) return delen[1];
  return delen[0] || 'AXE';
}

export interface TaakKluisInhoud {
  taskId: string;
  title: string;
  goal: string;
  agent: string;
  device?: PlanDevice | null;
  tab?: string;
  repo?: string | null;
  who?: string;
}

export function taakKluisTekst(in_: TaakKluisInhoud): string {
  const agentNaam = agentNaamVoorKluis(in_.agent);
  const tabNaam = tabLabelVoorKluis(in_.tab ?? 'home');
  const repoNaam = in_.repo ? repoNaamVoorKluis(in_.repo) : 'none';
  const who = in_.who?.trim() || WIE_WERKT;
  const regels = [
    `# ${in_.title}`,
    '',
    `- kind: task`,
    `- tab: ${tabNaam}`,
    `- agent: ${agentNaam}`,
    `- task: ${in_.taskId}`,
    `- repo: ${repoNaam}`,
    `- who: ${who}`,
    `- device: ${in_.device ?? 'any'}`,
    '',
    '## Instruction',
    '',
    in_.goal.trim() || in_.title,
    '',
    '## Notes',
    '',
    'Files and notes this task actually uses live in this folder.',
    '',
  ];
  return regels.join('\n');
}

export interface KluisKaart {
  path: string;
  title: string;
  tak: KluisTak;
  groep: string;
  samenvatting: string;
}

export function kluisKaartenVan(
  notes: Array<{ path: string; title: string; content: string }>,
): Record<KluisTak, KluisKaart[]> {
  const leeg: Record<KluisTak, KluisKaart[]> = {
    workplaces: [],
    agents: [],
    tasks: [],
    repos: [],
    memory: [],
  };
  for (const n of notes) {
    const tak = kluisTakVan(n.path);
    leeg[tak].push({
      path: n.path,
      title: n.title,
      tak,
      groep: kluisGroepVan(n.path),
      samenvatting: (n.content || '').replace(/^#.*$/m, '').replace(/\s+/g, ' ').trim().slice(0, 140),
    });
  }
  return leeg;
}

/** Tabs mogen elkaars map niet delen. */
export function tabsDelenMap(a: string, b: string): boolean {
  if (!a || !b) return false;
  return kluisPadVoorTab(a) === kluisPadVoorTab(b);
}
