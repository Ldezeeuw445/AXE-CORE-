// Canonieke NorthSea-afzender en verzend-herkomst (P0.8). Eén plek; de database
// (northsea_communications_guard) eist exact dezelfde waarden.

export const CANONICAL_FROM = "NorthSea Commodity Partners <trade@northseacommodity.com>";
export const CANONICAL_REPLY_TO = "trade@northseacommodity.com";
export const CANONICAL_TRANSPORT = "resend";

export type ActorType = "human" | "service" | "automation";
export type ApprovalBasis = "human_approved_draft" | "policy_allowed" | "system_acknowledgement" | "provider_reconciled";

export interface OutboundProvenanceInput {
  providerMessageId: string;
  actor: string;
  actorType: ActorType;
  approvalBasis: ApprovalBasis;
  replyDraftId?: string | null;
}

export interface OutboundProvenance {
  from_address: string;
  reply_to_address: string;
  transport: string;
  external_message_id: string;
  actor: string;
  actor_type: ActorType;
  approval_basis: ApprovalBasis;
  reply_draft_id: string | null;
}

export function outboundProvenance(p: OutboundProvenanceInput): OutboundProvenance {
  if (!p.providerMessageId?.trim()) throw new Error("provenance: provider message id required");
  if (!p.actor?.trim()) throw new Error("provenance: actor required");
  if ((p.approvalBasis === "human_approved_draft" || p.approvalBasis === "policy_allowed") && !p.replyDraftId) {
    throw new Error(`provenance: ${p.approvalBasis} requires a reply draft id`);
  }
  return {
    from_address: CANONICAL_FROM,
    reply_to_address: CANONICAL_REPLY_TO,
    transport: CANONICAL_TRANSPORT,
    external_message_id: p.providerMessageId,
    actor: p.actor,
    actor_type: p.actorType,
    approval_basis: p.approvalBasis,
    reply_draft_id: p.replyDraftId ?? null,
  };
}

/** Het Resend-verzoek met de canonieke afzender; `from`/`reply_to` zijn niet door een aanroeper te kiezen. */
export function resendPayload(to: string, subject: string, text: string, html: string, headers?: Record<string, string>) {
  const body: Record<string, unknown> = { from: CANONICAL_FROM, to: [to], subject, text, html, reply_to: CANONICAL_REPLY_TO };
  if (headers && Object.keys(headers).length) body.headers = headers;
  return body;
}

/** Foutcodes uit de database-guards herkennen, zonder interne details door te geven. */
export function guardCode(message: unknown): "NS_CONTACT_POLICY" | "NS_APPROVAL_INTEGRITY" | "NS_OUTBOUND_PROVENANCE" | "NS_SYNTHETIC" | null {
  const m = String(message ?? "").match(/NS_(CONTACT_POLICY|APPROVAL_INTEGRITY|OUTBOUND_PROVENANCE|SYNTHETIC)/);
  return m ? (`NS_${m[1]}` as never) : null;
}
