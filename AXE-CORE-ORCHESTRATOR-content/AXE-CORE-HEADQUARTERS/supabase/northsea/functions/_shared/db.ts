// Kleine database-helpers die elke function deelt: contactbeleid, beleid, audit.

import { asBlockReason, type BlockReason, parsePolicy, type PolicyRead } from "./policy.ts";

// deno-lint-ignore no-explicit-any
type Sb = any;

/** Contactbeleid uit de database. Een leesfout gooit: de aanroeper faalt dan dicht. */
export async function outboundBlockReason(sb: Sb, p: { companyId?: string | null; contactId?: string | null; email?: string | null; opportunityId?: string | null }): Promise<BlockReason> {
  const { data, error } = await sb.rpc("northsea_outbound_block_reason", {
    p_company_id: p.companyId ?? null, p_contact_id: p.contactId ?? null, p_email: p.email ?? null, p_opportunity_id: p.opportunityId ?? null,
  });
  if (error) throw new Error("contact_policy_unavailable");
  return asBlockReason(data);
}

export async function readPolicy(sb: Sb): Promise<PolicyRead> {
  const { data, error } = await sb.from("deal_automation_policy").select("*").eq("id", 1).maybeSingle();
  if (error) return { ok: false, error: "policy_read_failed" };
  return parsePolicy(data);
}

export interface AuditRow {
  actor_type: "human" | "service" | "automation" | "system";
  actor: string;
  action: string;
  policy_decision?: unknown;
  approval_identity?: string | null;
  communication_id?: string | null;
  opportunity_id?: string | null;
  company_id?: string | null;
  contact_id?: string | null;
  draft_id?: string | null;
  details?: Record<string, unknown>;
}

/** Audit best-effort: een auditfout mag een al gedane handeling niet laten lijken alsof hij niet gebeurde. */
export async function audit(sb: Sb, row: AuditRow): Promise<boolean> {
  try {
    const { error } = await sb.from("northsea_audit_events").insert({ ...row, details: row.details ?? {} });
    if (error) {
      console.error("audit insert failed", row.action, error.code ?? "");
      return false;
    }
    return true;
  } catch {
    console.error("audit insert threw", row.action);
    return false;
  }
}
