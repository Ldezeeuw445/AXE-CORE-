/**
 * AXE-inboxbeleid: wat Luka moet zien, wat AXE of de manager zelf mag
 * afhandelen, en wat nooit als menselijk akkoord mag tellen.
 *
 * Los van deal_automation_policy.auto_send_* (die vlaggen blijven uit tot
 * Luka ze zelf zet) en van de is_human-hekken: een auto-approve hier is een
 * inbox-besluit, geen human_approved op het concept, en geen send.
 *
 * Fase 2 (niet in deze PR): dezelfde item-id wordt ook vanuit een manager-
 * thread of een emoji-reactie beslist.
 */

export type ApprovalCategorie =
  | 'chase'
  | 'cold_outreach'
  | 'nonbinding'
  | 'internal'
  | 'generic_qualification'
  | 'price'
  | 'contract'
  | 'commitment'
  | 'identity_disclosure'
  | 'deal_move'
  | 'risk_counterparty'
  | 'inbound_offer'
  | 'policy_change'
  | 'bounce'
  | 'unsure';

export type BeleidModus = 'escalate' | 'auto_approve' | 'auto_reject';
export type BesluitActor = 'human' | 'axe_policy' | 'manager';

export interface BeleidRegel {
  managerId: string;
  category: ApprovalCategorie | '*';
  mode: BeleidModus;
  /** Alleen Luka mag dit aanzetten: extra drempels van die categorie vallen dan weg. */
  axeMayApproveAll: boolean;
}

export interface Kenmerk {
  kind: string;
  subject?: string | null;
  body?: string | null;
  toEmail?: string | null;
  sensitive?: boolean;
  hasThread?: boolean;
  addressVerified?: boolean;
  namedRecipient?: boolean;
  isRoleMailbox?: boolean;
  personalized?: boolean;
  genericTemplate?: boolean;
  dnc?: boolean;
  contactedWithinDays?: number | null;
  chases14dForContact?: number;
  firstContactsToday?: number;
  riskCounterparty?: boolean;
  inboundHasOffer?: boolean;
  bounced?: boolean;
  legalAttachment?: boolean;
  dealStageMove?: boolean;
  identityDisclosure?: boolean;
  policyChange?: boolean;
  internalHousekeeping?: boolean;
  generatedBy?: string | null;
  /** Brief opent met Dear Sir or Madam / To whom it may concern. */
  genericSalutation?: boolean;
}

export interface BeleidBesluit {
  category: ApprovalCategorie;
  mode: BeleidModus;
  actorType: BesluitActor;
  reason: string;
  needsLuka: boolean;
  marksHumanApproved: false;
  flipsAutoSend: false;
}

export const CATEGORIE_LABEL: Record<ApprovalCategorie, string> = {
  chase: 'Chase / follow-up',
  cold_outreach: 'First cold outreach',
  nonbinding: 'Non-binding reply',
  internal: 'Internal housekeeping',
  generic_qualification: 'Generic qualification draft',
  price: 'Price / fee / commission',
  contract: 'Contract / legal',
  commitment: 'Commitment (qty, terms, deadline)',
  identity_disclosure: 'Identity disclosure',
  deal_move: 'Deal move',
  risk_counterparty: 'Risk counterparty',
  inbound_offer: 'Reply to inbound offer',
  policy_change: 'Send-policy change',
  bounce: 'Bounced / unknown address',
  unsure: 'Unsure',
};

const HARD_ESCALATIE: ReadonlySet<ApprovalCategorie> = new Set([
  'price', 'contract', 'commitment', 'identity_disclosure', 'deal_move',
  'risk_counterparty', 'inbound_offer', 'policy_change', 'bounce', 'unsure',
]);

const ROUTINE: ReadonlySet<ApprovalCategorie> = new Set([
  'chase', 'cold_outreach', 'nonbinding', 'internal',
]);

export const STANDAARD_REGELS: BeleidRegel[] = [
  ...([...ROUTINE] as ApprovalCategorie[]).map((category) => ({
    managerId: 'northseamgr', category, mode: 'auto_approve' as const, axeMayApproveAll: false,
  })),
  { managerId: 'northseamgr', category: 'generic_qualification', mode: 'auto_reject', axeMayApproveAll: false },
  ...([...HARD_ESCALATIE] as ApprovalCategorie[]).map((category) => ({
    managerId: 'northseamgr', category, mode: 'escalate' as const, axeMayApproveAll: false,
  })),
];

const LUKA_IDS = new Set(['luka', 'user:luka']);

export function magLukaCategorieVrijgeven(wie: string | null | undefined): boolean {
  const s = (wie ?? '').trim().toLowerCase();
  if (!s) return false;
  if (s.includes('manager') || s.startsWith('axe-') || s.startsWith('northsea-')) return false;
  return LUKA_IDS.has(s) || s.startsWith('luka');
}

function tekst(k: Kenmerk): string {
  return `${k.subject ?? ''}\n${k.body ?? ''}`;
}

const PRIJS = /(?:\b\d[\d,.]{0,12}\s*(?:usd|eur|gbp|us\$|\$|€|£|%))|(?:(?:usd|eur|gbp|us\$|\$|€|£)\s*\d[\d,.]{0,12})|(?:\b\d[\d,.]{0,12}\s*(?:per\s*mt|\/\s*mt|pmt)\b)|(?:\bcommission\b|\bfee\b|\bmargin\b|\bdiscount\b)/i;
const CONTRACT = /\b(ncnda|ncnnda|imfpa|spa\b|loi\b|fee agreement|mandate|legal-document|contract)\b/i;
const COMMITMENT = /\b(\d[\d,.]{0,12}\s*mt\b|exclusiv(?:e|ity)|(?:we\s+)?can (?:ship|deliver|supply)|delivery guarante|lme registered|cif\s+[a-z]|fob\s+[a-z])/i;
/** Hard verboden in uitgaande NorthSea-tekst, ook als classificeer iets anders ziet. */
const VERBODEN_CLAIMS = /\b(lme[\s-]*registered|delivery\s+guarante\w*|guaranteed\s+(?:delivery|shipment)|(?:we|northsea)\s+(?:can|will|shall)\s+deliver|(?:we|northsea)\s+(?:can\s+|will\s+|shall\s+)?(?:offer|supply|ship|provide|deliver)\s+\d|(?:we|northsea)\b[\s\S]{0,40}\bcif\b|(?:offer|quote|price|indication).{0,30}\bcif\b)/i;
const GENERIC_SALUTATION = /^\s*(?:dear\s+(?:sir(?:\s+or\s+madam)?|madam(?:\s+or\s+sir)?|sirs|sir\s*\/\s*madam|valued\s+\w+)|to\s+whom\s+it\s+may\s+concern)\b/im;
const IDENTITEIT = /\b(introduce you to the (?:buyer|seller)|buyer identity|seller identity|counterparty identity|we will introduce)\b/i;
const QUAL = /supply qualification/i;
const ENGINE = /northsea-(?:mcp|engine)|northsea_mcp/i;
const NONBIND = /\b(assay|spec(?:s|ification)?s?\b|kyc|kyb|schedule a call|available for a call|letter of intent|\bloi\b|\bfco\b|please (?:share|send|confirm) (?:the )?(?:coa|documents?|docs))\b/i;
const OFFER_TERMEN = PRIJS;

export function classificeer(k: Kenmerk): ApprovalCategorie {
  if (k.policyChange) return 'policy_change';
  if (k.bounced) return 'bounce';
  if (k.riskCounterparty) return 'risk_counterparty';
  if (k.identityDisclosure || IDENTITEIT.test(tekst(k))) return 'identity_disclosure';
  if (k.dealStageMove || k.kind === 'deal_decision') return 'deal_move';
  const t = tekst(k);
  if (k.legalAttachment || CONTRACT.test(t)) return 'contract';
  if (PRIJS.test(t)) return 'price';
  if (COMMITMENT.test(t)) return 'commitment';
  if (k.inboundHasOffer) {
    // Alleen een vrijblijvende vraag om specs/volume/bestemming mag door; termen zijn al price/commitment.
    if (NONBIND.test(t) && !OFFER_TERMEN.test(t) && !COMMITMENT.test(t)) return 'nonbinding';
    return 'inbound_offer';
  }
  // Alleen eerste contact. Een vervolg in een bestaande thread (Re: … supply
  // qualification, generated_by northsea-engine) mag niet auto-rejecten: dat
  // is juist het concept dat /wacht moet tonen als de inhoudspoort hem tegenhoudt.
  if (!k.hasThread && QUAL.test(k.subject ?? '') && (k.genericTemplate || ENGINE.test(k.generatedBy ?? ''))) {
    return 'generic_qualification';
  }
  if (k.internalHousekeeping) return 'internal';
  if (NONBIND.test(t)) return 'nonbinding';
  if (k.hasThread) return 'chase';
  if (k.personalized || k.namedRecipient || k.isRoleMailbox) return 'cold_outreach';
  if (k.kind === 'action_queue_approval' || k.kind === 'deal_tasks_approval') return 'internal';
  return 'unsure';
}

function regelVoor(regels: BeleidRegel[], managerId: string, category: ApprovalCategorie): BeleidRegel {
  return regels.find((r) => r.managerId === managerId && r.category === category)
    ?? regels.find((r) => r.managerId === managerId && r.category === '*')
    ?? regels.find((r) => r.managerId === '*' && r.category === category)
    ?? { managerId, category, mode: HARD_ESCALATIE.has(category) ? 'escalate' : 'escalate', axeMayApproveAll: false };
}

function heeftGeneriekeAanhef(k: Kenmerk): boolean {
  return k.genericSalutation === true || GENERIC_SALUTATION.test(tekst(k));
}

function heeftVerbodenClaim(k: Kenmerk): boolean {
  return VERBODEN_CLAIMS.test(tekst(k)) || COMMITMENT.test(tekst(k)) || PRIJS.test(tekst(k));
}

function drempelChase(k: Kenmerk): string | null {
  if (!k.hasThread) return 'Not an existing thread.';
  if (heeftGeneriekeAanhef(k)) {
    return 'Generic salutation (Dear Sir or Madam / To whom it may concern).';
  }
  if (heeftVerbodenClaim(k)) return 'Chase contains a banned claim, price or commitment.';
  if (!k.namedRecipient || k.isRoleMailbox) return 'Recipient is not a named person.';
  if (!k.addressVerified) return 'Address is not verified.';
  if ((k.chases14dForContact ?? 0) >= 2) return 'Already two chases to this contact in 14 days.';
  return null;
}

function drempelCold(k: Kenmerk): string | null {
  const adresOk = (k.namedRecipient && k.addressVerified) || (k.isRoleMailbox && k.addressVerified);
  if (!adresOk) return 'No verified named contact or sales@/info@ address.';
  if (!k.personalized) return 'Not personalized (company name plus a specific reason).';
  if (k.genericTemplate) return 'Generic template text.';
  if (k.dnc) return 'On the do-not-contact list.';
  if (k.contactedWithinDays != null && k.contactedWithinDays < 7) return 'Contacted in the last 7 days.';
  if ((k.firstContactsToday ?? 0) >= 30) return 'Desk-wide first-contact cap (~30/day) reached.';
  return null;
}

export function evalueer(
  k: Kenmerk,
  regels: BeleidRegel[] = STANDAARD_REGELS,
  managerId = 'northseamgr',
): BeleidBesluit {
  const category = classificeer(k);
  const regel = regelVoor(regels, managerId, category);
  const basis = {
    category,
    marksHumanApproved: false as const,
    flipsAutoSend: false as const,
  };

  if (k.sensitive && !regel.axeMayApproveAll) {
    return {
      ...basis,
      mode: 'escalate',
      actorType: 'human',
      needsLuka: true,
      reason: 'Sensitive draft: needs Luka.',
    };
  }

  if (regel.mode === 'auto_reject') {
    return {
      ...basis,
      mode: 'auto_reject',
      actorType: 'axe_policy',
      needsLuka: false,
      reason: `Auto-rejected: ${CATEGORIE_LABEL[category]}. Generic engine/MCP qualification drafts are not sent.`,
    };
  }

  if (regel.mode === 'escalate' && !regel.axeMayApproveAll) {
    return {
      ...basis,
      mode: 'escalate',
      actorType: 'human',
      needsLuka: true,
      reason: `Needs Luka: ${CATEGORIE_LABEL[category]}.`,
    };
  }

  if (regel.axeMayApproveAll || regel.mode === 'auto_approve') {
    if (!regel.axeMayApproveAll) {
      if (category === 'chase') {
        const nee = drempelChase(k);
        if (nee) {
          return { ...basis, mode: 'escalate', actorType: 'human', needsLuka: true, reason: nee };
        }
      }
      if (category === 'nonbinding') {
        // Zelfde inhoudspoort als chase: een generieke aanhef of verboden claim
        // mag niet via 'please share the COA' alsnog auto-approven.
        if (heeftGeneriekeAanhef(k)) {
          return {
            ...basis, mode: 'escalate', actorType: 'human', needsLuka: true,
            reason: 'Generic salutation (Dear Sir or Madam / To whom it may concern).',
          };
        }
        if (heeftVerbodenClaim(k)) {
          return {
            ...basis, mode: 'escalate', actorType: 'human', needsLuka: true,
            reason: 'Draft contains a banned claim, price or commitment.',
          };
        }
      }
      if (category === 'cold_outreach') {
        const nee = drempelCold(k);
        if (nee) {
          return { ...basis, mode: 'escalate', actorType: 'human', needsLuka: true, reason: nee };
        }
      }
    }
    if (regel.mode === 'auto_approve' || regel.axeMayApproveAll) {
      return {
        ...basis,
        mode: 'auto_approve',
        actorType: 'axe_policy',
        needsLuka: false,
        reason: regel.axeMayApproveAll
          ? `AXE may approve everything in ${CATEGORIE_LABEL[category]} (Luka switch).`
          : `Auto-approved: ${CATEGORIE_LABEL[category]} under the conservative NorthSea rules.`,
      };
    }
  }

  return {
    ...basis,
    mode: 'escalate',
    actorType: 'human',
    needsLuka: true,
    reason: `Needs Luka: ${CATEGORIE_LABEL[category]}.`,
  };
}
