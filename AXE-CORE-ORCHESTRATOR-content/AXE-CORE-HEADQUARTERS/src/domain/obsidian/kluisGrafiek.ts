/**
 * De kluis als één gekoppeld diagram: tab, agent, taak, repo.
 * Zelfde notities als de kaarten — geen tweede set, geen radar.
 */
import {
  kluisKaartenVan,
  kluisPadVoorAgent,
  kluisPadVoorTaak,
  kluisPadVoorTab,
  kluisTakVan,
  type KluisKaart,
} from '@/domain/obsidian/kluisBoom';
import { agentVoorTab } from '@/domain/obsidian/werkplek';
import type { WerkItem } from '@/domain/werkBron';

export type KluisKnoopSoort = 'tab' | 'agent' | 'task' | 'repo';

export interface KluisKnoop {
  id: string;
  path: string;
  label: string;
  soort: KluisKnoopSoort;
}

export interface KluisLijn {
  van: string;
  naar: string;
}

export interface KluisGrafiek {
  knopen: KluisKnoop[];
  lijnen: KluisLijn[];
}

const SOORT: Record<'workplaces' | 'agents' | 'tasks' | 'repos', KluisKnoopSoort> = {
  workplaces: 'tab',
  agents: 'agent',
  tasks: 'task',
  repos: 'repo',
};

export function architectuurKaarten(
  notes: Array<{ path: string; title: string; content: string }>,
): KluisKaart[] {
  const groepen = kluisKaartenVan(notes);
  return [...groepen.workplaces, ...groepen.agents, ...groepen.tasks, ...groepen.repos];
}

/** Knopen = dezelfde notities als de architectuurkaarten. */
export function kluisGrafiekVan(
  notes: Array<{ path: string; title: string; content: string }>,
): KluisGrafiek {
  const kaarten = architectuurKaarten(notes);
  const knopen: KluisKnoop[] = kaarten.map((k) => ({
    id: k.path,
    path: k.path,
    label: k.title || k.groep,
    soort: SOORT[k.tak],
  }));
  const paden = new Set(knopen.map((k) => k.path));
  const lijnen: KluisLijn[] = [];

  for (const k of kaarten) {
    if (k.tak === 'tasks') {
      const agentPad = `AXE/Agents/${k.groep}/workspace.md`;
      if (paden.has(agentPad)) lijnen.push({ van: agentPad, naar: k.path });
    }
    if (k.tak === 'workplaces') {
      const agent = agentVoorTab(k.groep);
      if (agent) {
        const agentPad = kluisPadVoorAgent(agent);
        if (paden.has(agentPad)) lijnen.push({ van: k.path, naar: agentPad });
      }
    }
    if (k.tak === 'repos') {
      const dev = kluisPadVoorAgent('developer');
      if (paden.has(dev)) lijnen.push({ van: dev, naar: k.path });
    }
  }

  const home = kluisPadVoorTab('home');
  if (paden.has(home)) {
    for (const k of kaarten) {
      if (k.tak === 'workplaces' && k.path !== home) {
        lijnen.push({ van: home, naar: k.path });
      }
    }
  }

  return { knopen, lijnen };
}

export function grafiekPadenGelijkAanKaarten(
  notes: Array<{ path: string; title: string; content: string }>,
): boolean {
  const kaarten = new Set(architectuurKaarten(notes).map((k) => k.path));
  const knopen = new Set(kluisGrafiekVan(notes).knopen.map((k) => k.path));
  if (kaarten.size !== knopen.size) return false;
  for (const p of kaarten) if (!knopen.has(p)) return false;
  return true;
}

/** Dezelfde werkset als Taken/planner/agenda, als kluisnotities. Geen cron. */
export function werkAlsKluisNotities(
  werk: readonly WerkItem[],
): Array<{ path: string; title: string; content: string }> {
  return werk
    .filter((w) => w.oorsprong !== 'cron')
    .map((w) => ({
      path: kluisPadVoorTaak(w.id, w.agentId),
      title: w.titel,
      content: `${w.oorsprongTekst}\n\n- kind: task\n- owner: ${w.eigenaar}\n- origin: ${w.oorsprong}\n`,
    }));
}

/**
 * Architectuurkaarten + dezelfde taken als het bord. Weestaken in de kluis
 * (geen eigenaar in de werkset) blijven weg.
 */
export function kluisNotitiesVoorBord(
  notes: Array<{ path: string; title: string; content: string }>,
  werk: readonly WerkItem[],
): Array<{ path: string; title: string; content: string }> {
  const rest = notes.filter((n) => kluisTakVan(n.path) !== 'tasks');
  return [...rest, ...werkAlsKluisNotities(werk)];
}
