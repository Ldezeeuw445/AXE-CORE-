/**
 * Boss (AXE Core) is not a manager. In the Managers chat room he sits as the
 * large top tile (Grok Bot–style Wingman) and forwards Luka's messages to the
 * right app manager.
 *
 * Projects Manager is the orchestrator over the app managers (pinned under
 * Boss) and can also dispatch with the same "Bericht gestuurd" relay line.
 *
 * Managers own coding for their repos via durable tasks (branch/PR only —
 * never auto-merge or deploy from this path).
 */
import { agentById, type AxeAgent, type AxeAgentId } from './roster';
import {
  GROK_MANAGER_IDS,
  GROK_REPO_SCOPE,
  isGrokManager,
  type GrokManagerId,
} from './grokManagers';

/** Roster id for the Boss tile in the Managers room. */
export const BOSS_ID: AxeAgentId = 'axe';

/** Projects Manager — orchestrator over the other app managers. */
export const PROJECTS_ORCH_ID: GrokManagerId = 'projectsmgr';

const CODING_RE =
  /\b(code|coding|fix|bug|refactor|implement|feature|bouw|build|patch|pr\b|pull request|branch|commit|repo|typescript|tsx|python|tauri|vite|component|ui|nav|tab)\b/i;

/** Keyword → manager. First match wins; order is specificity-first. */
const SIGNALEN: { id: GrokManagerId; re: RegExp }[] = [
  { id: 'companionmgr', re: /\b(companion|axe[- ]?companion|companion[- ]?os)\b/i },
  { id: 'axon', re: /\b(axon|memory manager|geheugen|long[- ]?term memory|obsidian|rag)\b/i },
  { id: 'tradingos', re: /\b(trading[- ]?os|trading app|axe[- ]?trading|mt5|demo trade|chart)\b/i },
  { id: 'northseamgr', re: /\b(northsea|north[- ]?sea|desk|deal|commodity|rfq|cargo|buyer|supplier)\b/i },
  { id: 'projectsmgr', re: /\b(projects? manager|projecten|notion|takenlijst|task board|bouwlijst)\b/i },
  { id: 'axemanager', re: /\b(axe[- ]?core|hq|headquarters|shell|tauri|bottom[- ]?nav|managers? (tab|chat)|overlay|notch)\b/i },
];

/** App groups for the Grok-style sidebar (mock order). Projects is pinned separately. */
export const MANAGER_APP_GROEPEN: readonly {
  label: string;
  ids: readonly GrokManagerId[];
}[] = [
  { label: 'AXE CORE', ids: ['axemanager'] },
  { label: 'AXE Companion', ids: ['companionmgr'] },
  { label: 'Trading OS', ids: ['tradingos'] },
  { label: 'AXON Memory App', ids: ['axon'] },
  { label: 'NorthSea Commodity Partners', ids: ['northseamgr'] },
] as const;

export function isBoss(id: string | null | undefined): boolean {
  return id === BOSS_ID;
}

export function isProjectsOrch(id: string | null | undefined): boolean {
  return id === PROJECTS_ORCH_ID;
}

/** Boss or Projects Manager may hand a message to another manager. */
export function magDoorgeven(id: string | null | undefined): boolean {
  return isBoss(id) || isProjectsOrch(id);
}

export function bossAgent(): AxeAgent {
  return agentById(BOSS_ID);
}

export function projectsOrchAgent(): AxeAgent {
  return agentById(PROJECTS_ORCH_ID);
}

/** The six app managers — Boss is never in this list. */
export function managersZonderBoss(): AxeAgent[] {
  return GROK_MANAGER_IDS.map((id) => agentById(id));
}

/** App managers under Projects (excludes Projects itself). */
export function managersOnderProjects(): AxeAgent[] {
  return GROK_MANAGER_IDS.filter((id) => id !== PROJECTS_ORCH_ID).map((id) => agentById(id));
}

export function classificeerBossNaarManager(tekst: string): GrokManagerId {
  const t = (tekst || '').trim();
  for (const s of SIGNALEN) {
    if (s.re.test(t)) return s.id;
  }
  // Default: AXE Core Manager owns the HQ app itself.
  return 'axemanager';
}

/**
 * Projects Manager routing: same signals, but never routes back to itself
 * (falls through to AXE CORE Manager).
 */
export function classificeerProjectsNaarManager(tekst: string): GrokManagerId {
  const target = classificeerBossNaarManager(tekst);
  return target === PROJECTS_ORCH_ID ? 'axemanager' : target;
}

export function doorgestuurdTekst(managerId: GrokManagerId): string {
  const a = agentById(managerId);
  return `doorgestuurd naar ${a.name}`;
}

/** Label shown next to the relay avatar (Grok: "Bericht gestuurd • Name"). */
export function berichtGestuurdLabel(fromAgentId: string): string {
  return managerNaam(fromAgentId);
}

export function isCodingOpdracht(tekst: string): boolean {
  return CODING_RE.test(tekst || '');
}

export function primaireRepoVoor(managerId: GrokManagerId): string {
  return GROK_REPO_SCOPE[managerId].repos[0] ?? 'AXE-CORE-';
}

/**
 * Metadata every manager coding task carries so workers never merge/deploy
 * from this chat path — branch + PR only, Luka approves.
 */
export function managerCodingMeta(managerId: GrokManagerId, tekst: string): {
  repo: string;
  produce_pr_only: true;
  no_auto_merge: true;
  no_deploy: true;
  manager_coding: true;
  manager: GrokManagerId;
  repos: readonly string[];
  request: string;
} {
  const scope = GROK_REPO_SCOPE[managerId];
  return {
    repo: primaireRepoVoor(managerId),
    produce_pr_only: true,
    no_auto_merge: true,
    no_deploy: true,
    manager_coding: true,
    manager: managerId,
    repos: scope.repos,
    request: tekst,
  };
}

export function managerNaam(id: string): string {
  if (isGrokManager(id) || id === BOSS_ID) return agentById(id as AxeAgentId).name;
  return id;
}
