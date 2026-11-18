/**
 * Fase-2-contract voor managerchats (Grok Bot), niet gebouwd in deze PR.
 *
 * Luka, 18 nov 2026: dezelfde hover als Grok Bot (reactie, reply, ⋯ met Copy
 * en Copy request ID); emoji's twee kanten op; reply_to als quote erboven;
 * approval- en actiekaarten in dezelfde draad. Een 👍 of in-thread Approve
 * sluit HETZELFDE inbox-record als de knop in Wacht op jou.
 *
 * Dit bestand is het haakje: types + dezelfde-record-resolver. De UI in
 * ManagerChat.tsx blijft de huidige bubbels tot fase 2 wordt gebouwd.
 */
import type { BesluitLog } from '@/domain/approvals/beleidOpslag';

export const BERICHT_HOVER = ['react', 'reply', 'meer'] as const;
export type BerichtHover = (typeof BERICHT_HOVER)[number];

export const MEER_MENU = ['copy', 'copy_request_id'] as const;
export type MeerMenuActie = (typeof MEER_MENU)[number];

/** 👍/✅ = goedkeuren; 👎 = afwijzen; 👀 = gezien. Managers lezen dit en handelen. */
export const REACTIE_BETEKENIS: Record<string, 'approve' | 'reject' | 'ack'> = {
  '👍': 'approve',
  '✅': 'approve',
  '👎': 'reject',
  '👀': 'ack',
};

export type ManagerReactie = {
  emoji: string;
  /** Luka of een manager-id — twee kanten op. */
  from: string;
  at: number;
};

export type ReplyTo = {
  messageId: string;
  quote: string;
  from: string;
};

export type ManagerKaart =
  | {
      soort: 'approval';
      /** Zelfde id als WachtItem.id / axe_approval_items.item_id. */
      approvalItemId: string;
      title: string;
      doet: string;
      waarom: string;
    }
  | {
      soort: 'action';
      title: string;
      doet: string;
    };

export type ApprovalSleutel = {
  itemId: string;
  threadId?: string | null;
  messageId?: string | null;
};

/** Inbox, emoji en in-thread Approve wijzen naar één record. */
export function zelfdeApprovalRecord(a: ApprovalSleutel, b: ApprovalSleutel): boolean {
  if (a.itemId && a.itemId === b.itemId) return true;
  if (a.threadId && a.messageId && a.threadId === b.threadId && a.messageId === b.messageId) {
    return true;
  }
  return false;
}

export function vindOpDraad(
  items: readonly ApprovalSleutel[],
  threadId: string,
  messageId: string,
): ApprovalSleutel | undefined {
  return items.find((i) => i.threadId === threadId && i.messageId === messageId);
}

export function magReageren(wie: string): boolean {
  const s = (wie ?? '').trim().toLowerCase();
  if (!s) return false;
  return s === 'luka' || s.startsWith('luka') || s.endsWith('mgr') || s === 'axe' || s === 'axon';
}

export function besluitVanReactie(
  item: ApprovalSleutel,
  emoji: string,
  from: string,
  at = new Date().toISOString(),
): BesluitLog | null {
  const betekenis = REACTIE_BETEKENIS[emoji];
  if (betekenis !== 'approve' && betekenis !== 'reject') return null;
  return {
    itemId: item.itemId,
    action: betekenis,
    actorType: from === 'luka' || from.startsWith('luka') ? 'human' : 'manager',
    reason: `${emoji} on the manager thread.`,
    via: 'reaction',
    at,
    threadId: item.threadId ?? null,
    messageId: item.messageId ?? null,
  };
}

export function besluitInThread(
  item: ApprovalSleutel,
  actie: 'approve' | 'reject',
  at = new Date().toISOString(),
): BesluitLog {
  return {
    itemId: item.itemId,
    action: actie,
    actorType: 'human',
    reason: actie === 'approve' ? 'Approved in the manager thread.' : 'Rejected in the manager thread.',
    via: 'thread',
    at,
    threadId: item.threadId ?? null,
    messageId: item.messageId ?? null,
  };
}
