// send-approved-reply v9 (18 nov: + vervolgmails onder luka_followups_2026_11_18). v8 op live v7.1: auth accepteert de door de gateway geverifieerde service_role-JWT).
// Verstuurt ÉÉN door een MENS goedgekeurde draft, of (v8, 16 nov) één vrijblijvende
// eerste kwalificatiemail die de deskloop volgens Luka's vaste regel mag sturen:
// approval_status=not_required, policy_decision.allowed, niet gevoelig, alleen de
// drie first-touch-sjablonen, en alleen zolang deal_automation_policy het toestaat
// (northsea_policy_allows). Zo'n mail heet nooit "human approved".
//
// Let op: v7.1 stond sinds 17 okt alleen op de server; deze file is weer de bron.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { brandedHtml, withPlainSignature } from "./branded_v7.ts";
import { guardCode, outboundProvenance, resendPayload } from "../_shared/canonical.ts";
import { audit, outboundBlockReason } from "../_shared/db.ts";
import { blocksHumanSend } from "../_shared/policy.ts";

// De enige sjablonen die zonder mens mogen: geen prijs, geen identiteit, geen toezegging.
const POLICY_PURPOSES = new Set([
  "NorthSea MCP outreach: supplier_qualification",
  "NorthSea MCP outreach: buyer_qualification",
  "NorthSea MCP outreach: document_request",
]);

const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { "content-type": "application/json" } });

function jwtClaim(token: string, claim: string): string {
  try {
    const part = token.split(".")[1] ?? "";
    const norm = part.replace(/-/g, "+").replace(/_/g, "/");
    const pad = norm + "=".repeat((4 - norm.length % 4) % 4);
    const payload = JSON.parse(atob(pad));
    return typeof payload?.[claim] === "string" ? payload[claim] : "";
  } catch {
    return "";
  }
}

function authorize(req: Request): boolean {
  const expected = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  const auth = req.headers.get("authorization") ?? "";
  if (expected && auth === "Bearer " + expected) return true;
  // verify_jwt=true: gateway already validated signature; require service_role for this project.
  const token = auth.replace(/^Bearer\s+/i, "").trim();
  if (!token) return false;
  const url = Deno.env.get("SUPABASE_URL") ?? "";
  const projectRef = (url.match(/https:\/\/([^.]+)\./) ?? [])[1] ?? "";
  if (jwtClaim(token, "role") !== "service_role") return false;
  const ref = jwtClaim(token, "ref");
  if (projectRef && ref && ref !== projectRef) return false;
  return true;
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return json({ ok: false, error: "method_not_allowed" }, 405);
  try {
    if (!authorize(req)) return json({ ok: false, error: "forbidden" }, 403);
    const key = Deno.env.get("RESEND_API_KEY");
    if (!key) return json({ ok: false, error: "resend_not_configured" }, 503);
    const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
    const p = await req.json().catch(() => ({}));
    const id = String(p?.draft_id ?? "").trim();
    const requestedBy = typeof p?.requested_by === "string" ? p.requested_by.slice(0, 120) : null;
    if (!id) return json({ ok: false, error: "draft_id_required" }, 400);
    const { data: d, error: e } = await sb.from("reply_drafts").select("*").eq("id", id).maybeSingle();
    if (e) throw e;
    if (!d) return json({ ok: false, error: "draft_not_found" }, 404);
    if (d.sent_at || d.resend_email_id) return json({ ok: true, duplicate: true, resend_email_id: d.resend_email_id });

    const policyPad = d.approval_status === "not_required";
    if (policyPad) {
      const pd = (d.policy_decision ?? {}) as Record<string, unknown>;
      const { data: mag } = await sb.rpc("northsea_policy_allows", { p_action: "auto_qualification_reply" });
      const eersteMail = d.generated_by === "northsea-mcp" && POLICY_PURPOSES.has(String(d.purpose ?? ""));
      // v9 (18 nov, Luka: "een bedrijf wat geautomatiseerd moet lopen"): ook een
      // vervolgmail van de engine op een EIGEN eerdere mail, onder de regel
      // luka_followups_2026_11_18, en alleen zolang auto_send_followups aanstaat.
      let vervolg = false;
      if (d.generated_by === "northsea-engine" && String(d.purpose ?? "").startsWith("Follow-up ")
          && pd.rule === "luka_followups_2026_11_18" && d.communication_id) {
        const { data: pol } = await sb.from("deal_automation_policy").select("auto_send_followups").eq("id", 1).maybeSingle();
        vervolg = pol?.auto_send_followups === true;
      }
      if (pd.allowed !== true || d.sensitive_action || !(eersteMail || vervolg)
          || d.approval_actor_type || d.approved_by || mag !== true) {
        await audit(sb, { actor_type: "service", actor: "send-approved-reply", action: "policy_send_refused", draft_id: d.id,
          opportunity_id: d.opportunity_id, company_id: d.company_id, details: { requested_by: requestedBy, policy_on: mag === true, purpose: d.purpose } });
        return json({ ok: false, error: "policy_send_not_allowed" }, 409);
      }
    } else {
      if (d.approval_status !== "approved") return json({ ok: false, error: "draft_not_approved", status: d.approval_status }, 409);
      if (d.approval_actor_type !== "human" || !String(d.approved_by ?? "").trim() || !d.approval_channel) {
        return json({ ok: false, error: "human_approval_provenance_missing" }, 409);
      }
    }
    if (!d.to_email || !d.subject || !d.body) return json({ ok: false, error: "draft_incomplete" }, 422);

    const reden = await outboundBlockReason(sb, { companyId: d.company_id, contactId: d.contact_id, email: d.to_email, opportunityId: d.opportunity_id });
    // Zonder mens ook niet naar wie eerst beoordeeld moet worden.
    if (blocksHumanSend(reden) || (policyPad && reden === "review_required")) {
      await audit(sb, { actor_type: "service", actor: "send-approved-reply", action: "send_blocked_contact_policy", approval_identity: d.approved_by,
        draft_id: d.id, communication_id: d.communication_id, opportunity_id: d.opportunity_id, company_id: d.company_id, details: { contact_policy: reden, requested_by: requestedBy } });
      return json({ ok: false, error: "contact_policy_blocked", contact_policy: reden }, 409);
    }
    if (d.sensitive_action) {
      const { data: o } = d.opportunity_id ? await sb.from("opportunities").select("commission_agreement_status").eq("id", d.opportunity_id).maybeSingle() : { data: null };
      if (!o || o.commission_agreement_status !== "signed") return json({ ok: false, error: "commission_protection_required" }, 409);
    }

    const { data: inb } = d.communication_id
      ? await sb.from("communications").select("external_message_id,rfc_message_id").eq("id", d.communication_id).maybeSingle()
      : { data: null };
    let mid: string | null = inb?.rfc_message_id ? `<${inb.rfc_message_id}>` : null;
    if (!mid && inb?.external_message_id) {
      try {
        const r = await fetch(`https://api.resend.com/emails/receiving/${encodeURIComponent(inb.external_message_id)}`, { headers: { Authorization: `Bearer ${key}` } });
        if (r.ok) { const f = await r.json(); mid = f?.message_id ?? f?.headers?.["message-id"] ?? null; }
      } catch (_) { /* threading is optioneel */ }
    }
    const hdr: Record<string, string> = {};
    if (mid) { hdr["In-Reply-To"] = mid; hdr["References"] = mid; }
    if (policyPad) hdr["X-NorthSea-Automation"] = "standing-rule-qualification";
    const r = await fetch("https://api.resend.com/emails", { method: "POST", headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json",
      "Idempotency-Key": `northsea-draft-${d.id}` }, body: JSON.stringify(resendPayload(d.to_email, d.subject, withPlainSignature(d.body), brandedHtml(d.body), hdr)) });
    const tx = await r.text();
    // deno-lint-ignore no-explicit-any
    let sent: any = null;
    try { sent = tx ? JSON.parse(tx) : null; } catch { sent = null; }
    if (!r.ok || !sent?.id) {
      await sb.from("reply_drafts").update({ lifecycle_state: "failed", updated_at: new Date().toISOString() }).eq("id", d.id);
      return json({ ok: false, error: "resend_send_failed", provider_status: r.status }, 502);
    }
    const now = new Date().toISOString();
    // Eerst de draft als verzonden markeren: een retry kan dan nooit opnieuw versturen.
    const { error: ue } = await sb.from("reply_drafts").update({ sent_at: now, resend_email_id: sent.id, lifecycle_state: "sent", updated_at: now }).eq("id", d.id);
    if (ue) throw ue;
    const { data: o, error: ce } = await sb.from("communications").insert({ company_id: d.company_id, contact_id: d.contact_id, opportunity_id: d.opportunity_id,
      direction: "outbound", channel: "email", subject: d.subject, body: d.body, occurred_at: now,
      ...outboundProvenance({ providerMessageId: sent.id, actor: "send-approved-reply", actorType: policyPad ? "automation" : "service",
        approvalBasis: policyPad ? "policy_allowed" : "human_approved_draft", replyDraftId: d.id }),
    }).select("id").single();
    if (ce) {
      console.error("send-approved-reply: sent but communication insert failed", guardCode(ce.message) ?? ce.code ?? "");
      await audit(sb, { actor_type: "service", actor: "send-approved-reply", action: "email_sent_record_failed", approval_identity: d.approved_by, draft_id: d.id,
        opportunity_id: d.opportunity_id, company_id: d.company_id, details: { resend_email_id: sent.id, error: guardCode(ce.message) ?? "insert_failed" } });
      return json({ ok: true, draft_id: d.id, communication_id: null, resend_email_id: sent.id, record_warning: "communication_insert_failed" });
    }
    if (d.opportunity_id) {
      await sb.from("opportunities").update({ next_action: "Await counterparty response to NorthSea email.", next_action_at: now, waiting_since: now }).eq("id", d.opportunity_id);
    }
    if (policyPad && d.opportunity_id) {
      await sb.from("deal_events").insert({ opportunity_id: d.opportunity_id, event_type: "policy_allowed_qualification_email_sent", actor: "send-approved-reply",
        summary: "Non-binding first qualification email sent by the Desk under Luka's standing rule (16 Nov); no price, identity or commitment.",
        metadata: { resend_email_id: sent.id, draft_id: d.id, requested_by: requestedBy } });
    }
    await audit(sb, { actor_type: policyPad ? "automation" : "service", actor: "send-approved-reply", action: policyPad ? "policy_email_sent" : "email_sent",
      approval_identity: d.approved_by, draft_id: d.id, communication_id: o.id, opportunity_id: d.opportunity_id, company_id: d.company_id, contact_id: d.contact_id,
      details: { resend_email_id: sent.id, approval_channel: d.approval_channel, requested_by: requestedBy, threaded: Boolean(mid), standing_rule: policyPad } });
    return json({ ok: true, draft_id: d.id, communication_id: o.id, resend_email_id: sent.id, threaded: Boolean(mid), branded_html: true, legal_footer: true });
  } catch (err) {
    console.error("send-approved-reply error", err instanceof Error ? err.message : "error");
    return json({ ok: false, error: "processing_failed" }, 500);
  }
});
