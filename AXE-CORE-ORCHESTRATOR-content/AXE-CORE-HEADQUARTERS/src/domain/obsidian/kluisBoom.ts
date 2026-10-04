/**
 * De echte kluisboom: workplaces, agentmappen, taakmappen.
 *
 * Eén blob voor alles was hoe tabs elkaars notities overschreven. Elke tab
 * heeft zijn eigen workplace, elke agent zijn map, elke taak een eigen map
 * onder AXE/ in de Obsidian-kluis. Geen I/O hier.
 */
import type { AxeAgentId } from '@/domain/agents/roster';
import type { PlanDevice } from '@/domain/tierRouter/beurtPlan';

export type KluisTak = 'workplaces' | 'agents' | 'tasks' | 'memory';

export const KLUIS_TAKKEN: readonly KluisTak[] = [
  'workplaces', 'agents', 'tasks', 'memory',
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
  return `AXE/Workplaces/${slugVoorKluis(tab)}/context.md`;
}

export function kluisPadVoorAgent(agent: AxeAgentId | string): string {
  return `AXE/Agents/${slugVoorKluis(String(agent))}/workspace.md`;
}

export function kluisPadVoorTaak(taskId: string): string {
  return `AXE/Tasks/${slugVoorKluis(taskId)}/task.md`;
}

export function kluisTakVan(path: string): KluisTak {
  const p = (path || '').replace(/^\/+/, '');
  if (p.startsWith('AXE/Workplaces/')) return 'workplaces';
  if (p.startsWith('AXE/Agents/')) return 'agents';
  if (p.startsWith('AXE/Tasks/')) return 'tasks';
  return 'memory';
}

export function kluisTakLabel(tak: KluisTak): string {
  switch (tak) {
    case 'workplaces': return 'Workplaces';
    case 'agents': return 'Agents';
    case 'tasks': return 'Tasks';
    default: return 'Memory';
  }
}

export interface TaakKluisInhoud {
  taskId: string;
  title: string;
  goal: string;
  agent: string;
  device?: PlanDevice | null;
  tab?: string;
}

export function taakKluisTekst(in_: TaakKluisInhoud): string {
  const regels = [
    `# ${in_.title}`,
    '',
    `- task: ${in_.taskId}`,
    `- agent: ${in_.agent}`,
    `- device: ${in_.device ?? 'any'}`,
    `- tab: ${in_.tab ?? 'home'}`,
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

/** Tabs mogen elkaars map niet delen. */
export function tabsDelenMap(a: string, b: string): boolean {
  if (!a || !b) return false;
  return kluisPadVoorTab(a) === kluisPadVoorTab(b);
}
