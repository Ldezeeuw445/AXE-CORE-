/**
 * Namen die een mens herkent: tab, agent, repo. Geen I/O.
 *
 * Hieruit volgt waar werk landt als Luka een desk noemt in plaats van een
 * agent-id of een map. "Northsea Desk" is de tab; de NorthSea-agent hoort
 * daarbij. Zonder deze tabel moet hij de map zelf noemen.
 */
import { AXE_AGENTS, agentById, type AxeAgentId } from '@/domain/agents/roster';
import { NAV_ITEMS } from '@/domain/navRegistry';

export const WIE_WERKT = 'Luka';

export interface RepoWerkplek {
  id: string;
  label: string;
  owner: string;
  repo: string;
  branch: string;
}

/** Zelfde repos als DEFAULT_REPOS, zonder tokens — domain mag infra niet trekken. */
export const REPO_WERKPLEKKEN: readonly RepoWerkplek[] = [
  { id: 'axe-core', label: 'AXE CORE', owner: 'Ldezeeuw445', repo: 'AXE-CORE-', branch: 'orchestrator' },
  { id: 'axe-companion', label: 'AXE Companion OS', owner: 'Ldezeeuw445', repo: 'AXE-COMPANION-OS-', branch: 'main' },
  { id: 'trading-os', label: 'Trading OS', owner: 'TRADING-AXE-OS-APPS', repo: 'TRADING-OS', branch: 'main' },
  { id: 'axon', label: 'AXON Memory', owner: 'Ldezeeuw445', repo: 'axon-memory', branch: 'main' },
];

const REPO_ALIAZEN: Record<string, string> = {
  'axe-core': 'axe-core',
  'axe core': 'axe-core',
  axecore: 'axe-core',
  headquarters: 'axe-core',
  'axe-companion': 'axe-companion',
  'axe companion': 'axe-companion',
  companion: 'axe-companion',
  'trading-os': 'trading-os',
  'trading os': 'trading-os',
  axon: 'axon',
  'axon memory': 'axon',
};

export interface WerkplekKeuze {
  agent: AxeAgentId | null;
  tab: string | null;
  repo: string | null;
  bron: string;
  opdracht: boolean;
}

export function kluisMapNaam(raw: string): string {
  const s = (raw || '')
    .trim()
    .replace(/[\\/:*?"<>|]+/g, '-')
    .replace(/\s+/g, ' ')
    .slice(0, 80);
  return s || 'untitled';
}

export function agentNaamVoorKluis(agent: AxeAgentId | string): string {
  const id = String(agent) as AxeAgentId;
  return kluisMapNaam(agentById(id).name || String(agent));
}

export function tabLabelVoorKluis(tab: string): string {
  const raw = (tab || '').trim();
  if (!raw) return 'Home';
  const slug = raw.replace(/^\/+/, '').toLowerCase() || 'home';
  const byPath = NAV_ITEMS.find((i) => {
    const p = i.path.replace(/^\/+/, '').toLowerCase() || 'home';
    return p === slug || p.split('/')[0] === slug;
  });
  if (byPath) return byPath.label;
  const byLabel = NAV_ITEMS.find((i) => i.label.toLowerCase() === raw.toLowerCase());
  if (byLabel) return byLabel.label;
  return kluisMapNaam(raw);
}

export function repoNaamVoorKluis(repoId: string): string {
  const r = REPO_WERKPLEKKEN.find((x) => x.id === repoId);
  return kluisMapNaam(r?.label || repoId);
}

export function repoIdVanTekst(text: string): string | null {
  const lower = (text || '').toLowerCase();
  if (!lower.trim()) return null;
  if (REPO_ALIAZEN[lower.trim()]) return REPO_ALIAZEN[lower.trim()];
  const hits = Object.entries(REPO_ALIAZEN)
    .filter(([alias]) => alias.length >= 4 && lower.includes(alias))
    .sort((a, b) => b[0].length - a[0].length);
  return hits[0]?.[1] ?? null;
}

export function agentVoorTab(tab: string): AxeAgentId | null {
  const label = tabLabelVoorKluis(tab);
  const item = NAV_ITEMS.find((i) => i.label === label);
  if (!item) return null;
  const route = item.path.replace(/^\/+/, '');
  const agent = AXE_AGENTS.find((a) => a.route === route);
  return agent?.id ?? null;
}

interface Alias {
  alias: string;
  agent: AxeAgentId | null;
  tab: string | null;
  repo: string | null;
}

function bouwAliassen(): Alias[] {
  const out: Alias[] = [];
  for (const agent of AXE_AGENTS) {
    const tab = agent.route ? tabLabelVoorKluis(agent.route) : null;
    out.push({ alias: agent.id, agent: agent.id, tab, repo: null });
    out.push({ alias: agent.name.toLowerCase(), agent: agent.id, tab, repo: null });
    if (agent.kort) {
      out.push({ alias: agent.kort.toLowerCase(), agent: agent.id, tab, repo: null });
    }
  }
  for (const item of NAV_ITEMS) {
    const agent = agentVoorTab(item.label);
    out.push({ alias: item.label.toLowerCase(), agent, tab: item.label, repo: null });
    for (const kw of item.keywords) {
      if (kw.length < 10 && !kw.includes(' ')) continue;
      out.push({ alias: kw.toLowerCase(), agent, tab: item.label, repo: null });
    }
  }
  for (const repo of REPO_WERKPLEKKEN) {
    out.push({ alias: repo.id, agent: 'developer', tab: 'Code Editor', repo: repo.id });
    out.push({ alias: repo.label.toLowerCase(), agent: 'developer', tab: 'Code Editor', repo: repo.id });
  }
  for (const [alias, id] of Object.entries(REPO_ALIAZEN)) {
    if (alias.length < 6) continue;
    out.push({ alias, agent: 'developer', tab: 'Code Editor', repo: id });
  }
  out.sort((a, b) => b.alias.length - a.alias.length);
  return out;
}

const ALIASSEN = bouwAliassen();

const OPDRACHT_AAN =
  /(?:^|\b)(?:doe|maak|check|bekijk|kijk|werk|handle|do|work)\s+(?:dit|dat|het|this|that|it)?\s*(?:aan|op|voor|in|on|at|for|to)\s+(.+)$/i;

function matchAlias(doel: string): Alias | null {
  const t = doel.toLowerCase().trim().replace(/^(de|het|the|een|a|an)\s+/, '');
  if (!t) return null;
  for (const a of ALIASSEN) {
    if (t === a.alias || t.endsWith(` ${a.alias}`) || t.startsWith(`${a.alias} `)) return a;
  }
  return null;
}

/**
 * Desk, tab of repo uit gewone taal. "doe dit aan Northsea Desk" noemt geen
 * agent-id en geen map — alleen de desk.
 */
export function werkplekVanTekst(text: string): WerkplekKeuze {
  const raw = (text || '').trim();
  if (!raw) return { agent: null, tab: null, repo: null, bron: '', opdracht: false };

  const opdrachtDoel = raw.match(OPDRACHT_AAN)?.[1];
  if (opdrachtDoel) {
    const hit = matchAlias(opdrachtDoel);
    if (hit) {
      return {
        agent: hit.agent,
        tab: hit.tab,
        repo: hit.repo ?? repoIdVanTekst(raw),
        bron: hit.alias,
        opdracht: true,
      };
    }
  }

  const lower = raw.toLowerCase();
  for (const a of ALIASSEN) {
    if (a.alias.length < 8 && !a.alias.includes(' ')) continue;
    if (new RegExp(`\\b${a.alias.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i').test(lower)) {
      return {
        agent: a.agent,
        tab: a.tab,
        repo: a.repo ?? repoIdVanTekst(raw),
        bron: a.alias,
        opdracht: false,
      };
    }
  }

  const repo = repoIdVanTekst(raw);
  if (repo) return { agent: 'developer', tab: 'Code Editor', repo, bron: repo, opdracht: false };
  return { agent: null, tab: null, repo: null, bron: '', opdracht: false };
}
