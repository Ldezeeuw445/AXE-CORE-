/**
 * Boss (AXE Core) is not a manager. In the Managers chat room he sits at the
 * top and forwards Luka's messages to the right app manager.
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

/** Roster id for the Boss row in the Managers room. */
export const BOSS_ID: AxeAgentId = 'axe';

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

export function isBoss(id: string | null | undefined): boolean {
  return id === BOSS_ID;
}

export function bossAgent(): AxeAgent {
  return agentById(BOSS_ID);
}

/** The six app managers — Boss is never in this list. */
export function managersZonderBoss(): AxeAgent[] {
  return GROK_MANAGER_IDS.map((id) => agentById(id));
}

export function classificeerBossNaarManager(tekst: string): GrokManagerId {
  const t = (tekst || '').trim();
  for (const s of SIGNALEN) {
    if (s.re.test(t)) return s.id;
  }
  // Default: AXE Core Manager owns the HQ app itself.
  return 'axemanager';
}

export function doorgestuurdTekst(managerId: GrokManagerId): string {
  const a = agentById(managerId);
  return `doorgestuurd naar ${a.name}`;
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
