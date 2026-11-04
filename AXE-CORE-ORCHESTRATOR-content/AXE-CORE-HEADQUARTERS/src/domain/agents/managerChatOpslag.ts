/**
 * Per-manager chat history on Home. Survives collapse/reopen and app reloads.
 * Jobs still drive live status; this keeps the conversational thread Luka sees.
 *
 * Relay lines (`kind: "relay"`) are the small centered "Bericht gestuurd • Agent"
 * markers when Boss / Projects Manager hands a message to another manager.
 */
export type ManagerChatRol = 'user' | 'assistant' | 'system';

export type ManagerChatMsg = {
  id: string;
  role: ManagerChatRol;
  text: string;
  at: number;
  /** Soft error bubble — short friendly copy, never raw JSON. */
  error?: boolean;
  /** Inter-agent handoff marker (Grok Bot–style relay line). */
  kind?: 'relay';
  /** Agent who dispatched / who the relay names (avatar + label). */
  fromAgentId?: string;
};

const PREFIX = 'axe_manager_chat_v2:';
const MAX_MSGS = 200;

function sleutel(agentId: string): string {
  return `${PREFIX}${agentId}`;
}

export function laadManagerChat(agentId: string): ManagerChatMsg[] {
  if (!agentId || typeof localStorage === 'undefined') return [];
  try {
    const raw = localStorage.getItem(sleutel(agentId));
    if (!raw) return [];
    const parsed = JSON.parse(raw) as ManagerChatMsg[];
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((m) => m && typeof m.text === 'string' && (m.role === 'user' || m.role === 'assistant' || m.role === 'system'))
      .slice(-MAX_MSGS);
  } catch {
    return [];
  }
}

export function bewaarManagerChat(agentId: string, msgs: ManagerChatMsg[]): void {
  if (!agentId || typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(sleutel(agentId), JSON.stringify(msgs.slice(-MAX_MSGS)));
  } catch {
    /* quota — drop oldest half and retry once */
    try {
      localStorage.setItem(sleutel(agentId), JSON.stringify(msgs.slice(-Math.floor(MAX_MSGS / 2))));
    } catch { /* give up quietly */ }
  }
}

export function nieuwMsg(
  role: ManagerChatRol,
  text: string,
  extra?: Partial<ManagerChatMsg>,
): ManagerChatMsg {
  return {
    id: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
    role,
    text,
    at: Date.now(),
    ...extra,
  };
}

/** Centered relay line payload: "Bericht gestuurd" + named agent. */
export function nieuwRelayMsg(fromAgentId: string, label?: string): ManagerChatMsg {
  return nieuwMsg('system', label || 'Bericht gestuurd', {
    kind: 'relay',
    fromAgentId,
  });
}
