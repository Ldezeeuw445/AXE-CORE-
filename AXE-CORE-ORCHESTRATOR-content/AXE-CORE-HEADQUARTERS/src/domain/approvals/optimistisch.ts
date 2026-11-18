/**
 * Inbox-klikken voelen instant: de rij is weg zodra Luka tikt. Een 60s-refresh
 * of een trage send mag hem niet terugzetten (17 nov: Versturen wachtte op
 * approve+Resend, de lijst ververste, de tik leek verdwenen).
 */
import type { ApprovalCategorie } from './beleid';

export type InboxActie = 'approve' | 'reject' | 'send';

export interface InboxItem {
  id: string;
  bron: 'axe' | 'northsea';
  app: string;
  wie: string;
  wat: string;
  waarom: string;
  sinds: string;
  kanHierBeslissen: boolean;
  doet?: string;
  managerId?: string;
  category?: ApprovalCategorie;
  taskId?: string;
  dealId?: string;
  soort?: string;
  approvalId?: string;
  kanVersturen?: boolean;
  /** Fase 2: dezelfde record vanuit een manager-thread of reactie. */
  threadId?: string | null;
  messageId?: string | null;
}

export interface InboxStand {
  pending: InboxItem[];
  auto: InboxItem[];
  inFlight: Readonly<Record<string, InboxActie>>;
  gedaan: Readonly<Record<string, InboxActie>>;
}

export function leegStand(pending: InboxItem[], auto: InboxItem[] = []): InboxStand {
  return { pending, auto, inFlight: {}, gedaan: {} };
}

export function klik(stand: InboxStand, id: string, actie: InboxActie): InboxStand {
  if (stand.inFlight[id] || stand.gedaan[id]) return stand;
  if (!stand.pending.some((i) => i.id === id)) return stand;
  return {
    ...stand,
    pending: stand.pending.filter((i) => i.id !== id),
    inFlight: { ...stand.inFlight, [id]: actie },
  };
}

export function gelukt(stand: InboxStand, id: string): InboxStand {
  const actie = stand.inFlight[id];
  if (!actie) return stand;
  const rest = { ...stand.inFlight };
  delete rest[id];
  return { ...stand, inFlight: rest, gedaan: { ...stand.gedaan, [id]: actie } };
}

export function mislukt(stand: InboxStand, id: string, item: InboxItem): InboxStand {
  const rest = { ...stand.inFlight };
  delete rest[id];
  if (stand.pending.some((i) => i.id === id)) return { ...stand, inFlight: rest };
  return { ...stand, inFlight: rest, pending: [item, ...stand.pending] };
}

export function ververs(
  stand: InboxStand,
  vanServer: { pending: InboxItem[]; auto: InboxItem[] },
): InboxStand {
  const weg = new Set([...Object.keys(stand.inFlight), ...Object.keys(stand.gedaan)]);
  return {
    ...stand,
    pending: vanServer.pending.filter((i) => !weg.has(i.id)),
    auto: vanServer.auto,
  };
}
