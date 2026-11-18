/**
 * "Wacht op jou": één lijst met álles wat op Luka's ja of nee wacht.
 *
 * ## Waarom (Luka, 16–18 nov 2026)
 *
 * Vragen stonden op vijf plekken. NorthSea-rijen openden eerst de desk, maar
 * die schermen zijn alleen-lezen; `northsea_approve_draft` weigert
 * service-sleutels. De knop "Versturen" keurde goed én wachtte op Resend, en
 * een 60s-refresh zette de rij terug: de tik leek verdwenen.
 *
 * Hier komt het samen. Elke rij: titel, manager, wat het doet, waarom het
 * wacht. Approve/reject/bulk hier; send is een tweede, achtergrondstap.
 * Auto-approve (beleid.ts) haalt routine uit de wachtrij zonder human_approved
 * te zetten en zonder auto_send_* te wijzigen.
 *
 * Fase 2 (niet gebouwd): dezelfde item-id hangt aan threadId/messageId, zodat
 * een reactie of in-thread Approve hetzelfde record sluit.
 */

import {
  CATEGORIE_LABEL,
  classificeer,
  evalueer,
  type ApprovalCategorie,
  type BeleidBesluit,
  type BeleidRegel,
  type Kenmerk,
  STANDAARD_REGELS,
} from './beleid';
import type { InboxItem } from './optimistisch';

export type WachtBron = 'axe' | 'northsea';

export interface WachtItem extends InboxItem {
  /** Wat de actie doet, in één zin. */
  doet: string;
  category: ApprovalCategorie;
  managerId: string;
  beleid?: BeleidBesluit;
}

export interface AxeVraag {
  id: string;
  task_id: string;
  title?: string | null;
  detail?: string | null;
  wat?: string | null;
  waarom?: string | null;
  kind?: string | null;
  created_at: string;
  metadata?: Record<string, unknown> | null;
  thread_id?: string | null;
  message_id?: string | null;
}

export interface NorthseaVraag {
  approval_id: string;
  kind: string;
  deal_id?: string | null;
  subject?: string | null;
  body?: string | null;
  to_email?: string | null;
  sensitive_action?: boolean | null;
  gate?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
  generated_by?: string | null;
  has_thread?: boolean | null;
  address_verified?: boolean | null;
  named_recipient?: boolean | null;
  is_role_mailbox?: boolean | null;
  personalized?: boolean | null;
  generic_template?: boolean | null;
  dnc?: boolean | null;
  bounced?: boolean | null;
  risk_counterparty?: boolean | null;
  inbound_has_offer?: boolean | null;
  legal_attachment?: boolean | null;
  deal_stage_move?: boolean | null;
  identity_disclosure?: boolean | null;
  policy_change?: boolean | null;
  internal_housekeeping?: boolean | null;
  chases_14d?: number | null;
  first_contacts_today?: number | null;
  contacted_within_days?: number | null;
  thread_id?: string | null;
  message_id?: string | null;
}

const MANAGER_NAMEN: Record<string, string> = {
  projectsmgr: 'Projects Manager',
  northseamgr: 'NorthSea Manager',
  axemanager: 'AXE Core',
  tradingmgr: 'Trading Manager',
};

function schoon(s: string | null | undefined): string {
  return (s ?? '').replace(/\s+/g, ' ').trim();
}

/** "Yes needed: 2356eac9-…-… — Copper Cathode" -> "Copper Cathode". UUID's zegt Luka niets. */
export function zonderUuid(s: string): string {
  return schoon(
    s.replace(/\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi, '')
      .replace(/^\s*(yes needed|ja nodig)\s*:\s*/i, '')
      .replace(/^\s*[—–-]+\s*/, ''),
  );
}

const NORTHSEA_SOORT: Record<string, { wat: string; doet: string; waarom: string }> = {
  reply_draft: {
    wat: 'Mail ready to send',
    doet: 'Sends this exact draft to the counterparty.',
    waarom: 'The desk wrote this mail. It does not go out until you approve it here.',
  },
  deal_tasks_approval: {
    wat: 'Next step on a deal',
    doet: 'Lets the desk continue this deal step.',
    waarom: 'This sits outside the standing rule, so it waits for you.',
  },
  action_queue_approval: {
    wat: 'Desk action',
    doet: 'Runs a desk action that needs a yes (for example paid research).',
    waarom: 'Only your yes may spend this.',
  },
  deal_decision: {
    wat: 'Deal decision',
    doet: 'Moves, parks or stops the deal.',
    waarom: 'The deal is stuck until you choose.',
  },
  inbound_needs_human_review: {
    wat: 'Inbound mail to read',
    doet: 'Marks the inbound as reviewed so the desk can answer.',
    waarom: 'A counterparty wrote something the desk may not handle alone.',
  },
};

export function kenmerkVanNorthsea(r: NorthseaVraag): Kenmerk {
  return {
    kind: r.kind,
    subject: r.subject,
    body: r.body,
    toEmail: r.to_email,
    sensitive: r.sensitive_action === true,
    hasThread: r.has_thread === true,
    addressVerified: r.address_verified === true,
    namedRecipient: r.named_recipient === true,
    isRoleMailbox: r.is_role_mailbox === true,
    personalized: r.personalized === true,
    genericTemplate: r.generic_template === true,
    dnc: r.dnc === true,
    contactedWithinDays: r.contacted_within_days ?? null,
    chases14dForContact: r.chases_14d ?? 0,
    firstContactsToday: r.first_contacts_today ?? 0,
    riskCounterparty: r.risk_counterparty === true,
    inboundHasOffer: r.inbound_has_offer === true,
    bounced: r.bounced === true,
    legalAttachment: r.legal_attachment === true,
    dealStageMove: r.deal_stage_move === true,
    identityDisclosure: r.identity_disclosure === true,
    policyChange: r.policy_change === true,
    internalHousekeeping: r.internal_housekeeping === true,
    generatedBy: r.generated_by,
  };
}

export function vanAxe(rijen: AxeVraag[], managerVanTaak: Record<string, string> = {}): WachtItem[] {
  return rijen.filter((r) => r.id && r.task_id).map((r) => {
    const meta = r.metadata ?? {};
    const mgr = String(managerVanTaak[r.task_id] ?? meta.manager ?? meta.requested_by ?? '');
    const category = (typeof meta.category === 'string' ? meta.category : 'unsure') as ApprovalCategorie;
    return {
      id: `axe:${r.id}`,
      bron: 'axe' as const,
      app: 'AXE Core',
      wie: MANAGER_NAMEN[mgr] ?? (mgr || 'AXE Core'),
      managerId: mgr || 'axemanager',
      wat: schoon(r.wat || r.title) || 'A step that needs your OK',
      doet: schoon(String(meta.doet ?? r.kind ?? '')) || 'Runs this AXE task.',
      waarom: schoon(r.waarom || r.detail) || 'No reason was given.',
      sinds: r.created_at,
      kanHierBeslissen: true,
      taskId: r.task_id,
      category: category in CATEGORIE_LABEL ? category : 'unsure',
      threadId: r.thread_id ?? (typeof meta.thread_id === 'string' ? meta.thread_id : null),
      messageId: r.message_id ?? (typeof meta.message_id === 'string' ? meta.message_id : null),
    };
  });
}

export function vanNorthsea(rijen: NorthseaVraag[], regels: BeleidRegel[] = STANDAARD_REGELS): WachtItem[] {
  return rijen.filter((r) => r.approval_id).map((r) => {
    const soort = NORTHSEA_SOORT[r.kind] ?? { wat: 'Desk question', doet: 'Needs a decision.', waarom: schoon(r.gate) || 'Waiting on you.' };
    const onderwerp = zonderUuid(schoon(r.subject));
    const kenmerk = kenmerkVanNorthsea(r);
    const beleid = evalueer(kenmerk, regels);
    const category = beleid.category || classificeer(kenmerk);
    return {
      id: `northsea:${r.kind}:${r.approval_id}`,
      bron: 'northsea' as const,
      app: 'NorthSea',
      wie: 'NorthSea Manager',
      managerId: 'northseamgr',
      wat: onderwerp ? `${soort.wat}: ${onderwerp}` : soort.wat,
      doet: soort.doet,
      waarom: beleid.needsLuka ? soort.waarom : beleid.reason,
      sinds: r.created_at || r.updated_at || '',
      kanHierBeslissen: true,
      dealId: r.deal_id || undefined,
      soort: r.kind,
      approvalId: r.approval_id,
      kanVersturen: r.kind === 'reply_draft' && r.sensitive_action !== true,
      category,
      beleid,
      threadId: r.thread_id ?? null,
      messageId: r.message_id ?? null,
    };
  });
}

export function splitsOpBeleid(items: WachtItem[]): { pending: WachtItem[]; auto: WachtItem[] } {
  const pending: WachtItem[] = [];
  const auto: WachtItem[] = [];
  for (const i of items) {
    if (i.beleid && !i.beleid.needsLuka) auto.push(i);
    else pending.push(i);
  }
  return { pending, auto };
}

export function filterItems(
  items: readonly WachtItem[],
  f: { manager?: string; category?: string; bron?: WachtBron },
): WachtItem[] {
  return items.filter((i) => {
    if (f.manager && i.managerId !== f.manager && i.wie !== f.manager) return false;
    if (f.category && i.category !== f.category) return false;
    if (f.bron && i.bron !== f.bron) return false;
    return true;
  });
}

/** Oudste eerst: wat het langst wacht, staat bovenaan. */
export function samen(...lijsten: WachtItem[][]): WachtItem[] {
  const gezien = new Set<string>();
  return lijsten.flat()
    .filter((i) => (gezien.has(i.id) ? false : (gezien.add(i.id), true)))
    .sort((a, b) => a.sinds.localeCompare(b.sinds));
}

export function hoeLang(sinds: string, nu: Date = new Date()): string {
  const t = Date.parse(sinds);
  if (!Number.isFinite(t)) return '';
  const min = Math.max(0, Math.round((nu.getTime() - t) / 60_000));
  if (min < 60) return `${min} min`;
  const uur = Math.round(min / 60);
  if (uur < 48) return `${uur} uur`;
  return `${Math.round(uur / 24)} dagen`;
}
