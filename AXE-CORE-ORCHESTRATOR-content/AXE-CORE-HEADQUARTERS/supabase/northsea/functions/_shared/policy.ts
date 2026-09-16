// P0.3 Automatiseringsbeleid: lezen en afdwingen, fail-closed.
//
// deal_automation_policy is de enige bron. Ontbreekt de rij, is een veld geen
// echte boolean, of kan de database niet gelezen worden: dan is het antwoord NEE.
// Er is geen standaard die naar "versturen" valt.

import { CANONICAL_REPLY_TO } from "./canonical.ts";

export type BlockReason = "do_not_contact" | "synthetic" | "bounced_channel" | "review_required" | null;
export type MappingStatus = "mapped" | "ambiguous" | "unmapped" | "manual_review" | "synthetic";

const BOOLEAN_FIELDS = [
  "auto_send_qualification", "auto_send_followups", "auto_reply_nonbinding", "auto_disclose_counterparty_identity",
  "auto_accept_pricing", "auto_sign_documents", "auto_change_banking",
] as const;

export interface AutomationPolicy {
  auto_send_qualification: boolean;
  auto_send_followups: boolean;
  auto_reply_nonbinding: boolean;
  auto_disclose_counterparty_identity: boolean;
  auto_accept_pricing: boolean;
  auto_sign_documents: boolean;
  auto_change_banking: boolean;
  operational_mailbox: string | null;
}

export type PolicyRead = { ok: true; policy: AutomationPolicy } | { ok: false; error: string };

export function parsePolicy(row: unknown): PolicyRead {
  if (!row || typeof row !== "object" || Array.isArray(row)) return { ok: false, error: "policy_missing" };
  const r = row as Record<string, unknown>;
  for (const f of BOOLEAN_FIELDS) {
    if (typeof r[f] !== "boolean") return { ok: false, error: `policy_malformed:${f}` };
  }
  const mailbox = r.operational_mailbox;
  if (mailbox !== null && mailbox !== undefined && typeof mailbox !== "string") return { ok: false, error: "policy_malformed:operational_mailbox" };
  const p = Object.fromEntries(BOOLEAN_FIELDS.map((f) => [f, r[f]])) as Omit<AutomationPolicy, "operational_mailbox">;
  return { ok: true, policy: { ...p, operational_mailbox: (mailbox as string | null | undefined) ?? null } };
}

export interface PolicyDecision {
  action: string;
  allowed: boolean;
  reasons: string[];
  policy: AutomationPolicy | null;
  evaluated_at: string;
}

export interface AutoReplyInput {
  policyRead: PolicyRead;
  classification: string;
  sensitive: boolean;
  mappingStatus: MappingStatus;
  blockReason: BlockReason;
  synthetic: boolean;
  recipient: string | null;
  now?: Date;
}

/**
 * Mag resend-inbound een niet-bindende kwalificatie-reply ZELF versturen?
 * Alleen als ALLES waar is; elke reden om niet te sturen wordt vastgelegd.
 */
export function decideAutoQualificationReply(i: AutoReplyInput): PolicyDecision {
  const reasons: string[] = [];
  const policy = i.policyRead.ok ? i.policyRead.policy : null;
  if (!i.policyRead.ok) reasons.push(`policy_unavailable:${i.policyRead.error}`);
  if (policy) {
    if (policy.auto_send_qualification !== true) reasons.push("auto_send_qualification_disabled");
    if (policy.auto_reply_nonbinding !== true) reasons.push("auto_reply_nonbinding_disabled");
    if ((policy.operational_mailbox ?? "").trim().toLowerCase() !== CANONICAL_REPLY_TO) reasons.push("operational_mailbox_not_canonical");
  }
  if (!["buyer", "supplier"].includes(i.classification)) reasons.push(`classification_not_eligible:${i.classification}`);
  if (i.sensitive) reasons.push("sensitive_content");
  if (!(i.mappingStatus === "mapped" || i.mappingStatus === "unmapped")) reasons.push(`mapping_not_deterministic:${i.mappingStatus}`);
  if (i.blockReason) reasons.push(`contact_policy:${i.blockReason}`);
  if (i.synthetic) reasons.push("synthetic_record");
  if (!i.recipient) reasons.push("no_recipient");
  return { action: "auto_qualification_reply", allowed: reasons.length === 0, reasons, policy, evaluated_at: (i.now ?? new Date()).toISOString() };
}

/** Een menselijke verzending mag bij review_required; nooit bij do_not_contact of synthetic. */
export function blocksHumanSend(reason: BlockReason): boolean {
  return reason === "do_not_contact" || reason === "synthetic" || reason === "bounced_channel";
}

export function blocksAutomation(reason: BlockReason): boolean {
  return reason !== null;
}

export function asBlockReason(value: unknown): BlockReason {
  if (value === null || value === undefined) return null;
  if (value === "do_not_contact" || value === "synthetic" || value === "bounced_channel" || value === "review_required") return value;
  // Onbekende waarde uit de database: behandel als het strengste.
  return "do_not_contact";
}
