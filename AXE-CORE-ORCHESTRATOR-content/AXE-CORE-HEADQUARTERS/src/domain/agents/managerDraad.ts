/**
 * Pure regels voor de gedeelde managerdraad (zie managerDraadSync.ts).
 *
 * - Een serverbericht komt één keer in de lokale chat (id `s-<serverId>`), en
 *   niet als het hetzelfde bericht is dat dit apparaat zelf omhoog stuurde.
 * - Omhoog gaan alleen gewone user/assistant-berichten van na de eerste sync;
 *   geen doorstuur-regels, geen foutbubbels, niets dat van de server kwam.
 */
import type { ManagerChatMsg } from './managerChatOpslag';

export interface ServerBericht {
  id: string;
  agent: string;
  role: 'user' | 'assistant';
  text: string;
  at: string;
  read?: boolean;
}

const SERVER = 's-';

export function teVersturen(
  chat: ManagerChatMsg[],
  gekoppeld: Record<string, string>,
  sinds: number,
): ManagerChatMsg[] {
  return chat.filter((m) =>
    (m.role === 'user' || m.role === 'assistant')
    && !m.kind
    && !m.error
    && !m.id.startsWith(SERVER)
    && !gekoppeld[m.id]
    && m.at >= sinds
    && m.text.trim().length > 0);
}

export function koppelServerBerichten(
  chat: ManagerChatMsg[],
  server: ServerBericht[],
  gekoppeld: Record<string, string>,
): ManagerChatMsg[] {
  const eigen = new Set(Object.values(gekoppeld));
  const al = new Set(chat.map((m) => m.id));
  const erbij: ManagerChatMsg[] = [];
  for (const b of server) {
    const id = `${SERVER}${b.id}`;
    if (eigen.has(b.id) || al.has(id) || !b.text?.trim()) continue;
    const at = Date.parse(b.at);
    erbij.push({ id, role: b.role, text: b.text, at: Number.isFinite(at) ? at : Date.now() });
  }
  if (!erbij.length) return chat;
  return [...chat, ...erbij].sort((a, b) => a.at - b.at);
}
