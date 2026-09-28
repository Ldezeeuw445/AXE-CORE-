// Pure helpers for resend-reconcile-outbound. No network, no writes, no send path.
// commit is only true when the caller says so; anything else is a dry-run.

import { CANONICAL_REPLY_TO } from "./canonical.ts";
import { email } from "./inbound.ts";

export function wantsCommit(input: Record<string, unknown> | null | undefined): boolean {
  return input?.commit === true;
}

export function pageLimit(input: Record<string, unknown> | null | undefined): number {
  return Math.max(1, Math.min(5, Number(input?.max_pages ?? 2) || 2));
}

export function isCanonicalSender(v: unknown): boolean {
  return email(v) === CANONICAL_REPLY_TO;
}

export function asList(v: unknown): string[] {
  if (Array.isArray(v)) return v.map(String).filter(Boolean);
  return v ? [String(v)] : [];
}

export interface DraftLink {
  id?: unknown;
  company_id?: unknown;
  contact_id?: unknown;
  opportunity_id?: unknown;
}

/** Alleen exacte reply_draft-koppeling. Geen gok op deal/bedrijf/contact. */
export function exactDraftLinkage(draft: DraftLink | undefined) {
  return {
    company_id: draft?.company_id ?? null,
    contact_id: draft?.contact_id ?? null,
    opportunity_id: draft?.opportunity_id ?? null,
    mapping_status: draft?.opportunity_id ? "mapped" as const : "unmapped" as const,
    mapping_basis: draft?.opportunity_id ? "reply_draft_resend_email_id" : "provider_reconciliation",
  };
}
