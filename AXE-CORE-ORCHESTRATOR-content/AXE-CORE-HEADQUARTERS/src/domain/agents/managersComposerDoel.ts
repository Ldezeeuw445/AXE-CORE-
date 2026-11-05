/**
 * Wie de composer op de Managers-tab bezit.
 *
 * AppShell hangt PlaatChat altijd op (AXE Core / wingman). ManagerChat heeft
 * al een eigen composer voor de gekozen manager. Staat die desk open, dan mag
 * de schil-composer niet winnen: verberg hem, en een rest-send gaat alsnog
 * naar de gekozen manager — nooit standaard naar AXE Core.
 */
import { classifyAxeTier, type AxeRoute } from '@/domain/tierRouter/axeRoute';
import { GROK_MANAGER_IDS, isGrokManager } from './grokManagers';
import { isCodingOpdracht, BOSS_ID } from './bossRoute';
import type { AxeAgentId } from './roster';

const MANAGERS_COMPOSER_IDS: readonly AxeAgentId[] = [
  BOSS_ID,
  ...GROK_MANAGER_IDS,
];

export type ManagersComposerDoel = {
  /** False = ManagerChat-composer is de zichtbare invoer; PlaatChat weg. */
  schilComposer: boolean;
  /** Gekozen manager (of Boss) als de desk open is; null → AXE Core. */
  agentId: AxeAgentId | null;
};

export function isManagersTabPad(pathname: string): boolean {
  const p = (pathname || '/').split('?')[0];
  return p === '/managers' || p === '/agents' || p === '/ai-core' || p === '/organization';
}

function isManagersComposerAgent(id: string | null | undefined): id is AxeAgentId {
  return !!id && (MANAGERS_COMPOSER_IDS as readonly string[]).includes(id);
}

export function gekozenManagerVanSearch(search: string): AxeAgentId | null {
  const raw = search.startsWith('?') ? search.slice(1) : search;
  const open = new URLSearchParams(raw).get('open');
  return isManagersComposerAgent(open) ? open : null;
}

/**
 * Zichtbaar composer-doel zolang een manager op de Managers-tab geselecteerd is.
 *
 * - Andere tabs: schil-composer → AXE Core.
 * - Managers, desk dicht (Activity / Memory): schil-composer → AXE Core.
 * - Managers, desk open: ManagerChat-composer → gekozen manager (`?open=` of
 *   de live keuze). Standaardkeuze is Boss (`axe`), die classificeert en
 *   doorgeeft — dat blijft het Managers-pad, geen wingman-chat.
 */
export function managersComposerDoel(input: {
  pathname: string;
  search?: string;
  deskActief: boolean;
  gekozenId?: AxeAgentId | null;
}): ManagersComposerDoel {
  if (!isManagersTabPad(input.pathname) || !input.deskActief) {
    return { schilComposer: true, agentId: null };
  }
  const gekozen = isManagersComposerAgent(input.gekozenId)
    ? input.gekozenId
    : gekozenManagerVanSearch(input.search ?? '') ?? BOSS_ID;
  return { schilComposer: false, agentId: gekozen };
}

/** Durable-task-route voor een Managers-deskbericht. Agent is de selectie, niet wingman. */
export function managerChatRoute(agentId: AxeAgentId, tekst: string): AxeRoute {
  const coding = isCodingOpdracht(tekst) && isGrokManager(agentId);
  return {
    ...classifyAxeTier(tekst),
    tier: 3,
    kind: 'agent',
    agent: agentId,
    skill: null,
    confident: true,
    reason: coding ? 'managers:coding-task' : 'managers:chat-room',
  };
}
