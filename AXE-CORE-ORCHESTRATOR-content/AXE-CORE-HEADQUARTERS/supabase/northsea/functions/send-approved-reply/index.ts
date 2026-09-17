// send-approved-reply v7 (P0.4, P0.5, P0.8).
// Verstuurt ÉÉN door een MENS goedgekeurde draft. Nieuw t.o.v. v6:
// - approval_actor_type=human + approved_by + approval_channel zijn verplicht (geen herkomst = geen verzending);
// - contactbeleid vóór verzending (do_not_contact / synthetic weigeren);
// - gevoelige draft ook hier: getekende commissiebescherming op de deal;
// - de uitgaande communicatie krijgt volledige herkomst (canonieke afzender, transport, actor, basis, draft).
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { inferMailMode, renderNorthSeaMail } from "../_shared/mail.ts";
import { guardCode, outboundProvenance, resendPayload } from "../_shared/canonical.ts";
import { audit, outboundBlockReason } from "../_shared/db.ts";
import { blocksHumanSend } from "../_shared/policy.ts";

const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { "content-type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method !== "POST") return json({ ok: false, error: "method_not_allowed" }, 405);
  try {
    if (req.headers.get("authorization") !== "Bearer " + Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")) return json({ ok: false, error: "forbidden" }, 403);
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
    if (d.approval_status !== "approved") return json({ ok: false, error: "draft_not_approved", status: d.approval_status }, 409);
    if (d.approval_actor_type !== "human" || !String(d.approved_by ?? "").trim() || !d.approval_channel) {
      return json({ ok: false, error: "human_approval_provenance_missing" }, 409);
    }
    if (!d.to_email || !d.subject || !d.body) return json({ ok: false, error: "draft_incomplete" }, 422);

    const reden = await outboundBlockReason(sb, { companyId: d.company_id, contactId: d.contact_id, email: d.to_email, opportunityId: d.opportunity_id });
    if (blocksHumanSend(reden)) {
      await audit(sb, { actor_type: "service", actor: "send-approved-reply", action: "send_blocked_contact_policy", approval_identity: d.approved_by,
        draft_id: d.id, communication_id: d.communication_id, opportunity_id: d.opportunity_id, company_id: d.company_id, details: { contact_policy: reden, requested_by: requestedBy } });
      return json({ ok: false, error: "contact_policy_blocked", contact_policy: reden }, 409);
    }
    if (d.sensitive_action) {
      const { data: o } = d.opportunity_id ? await sb.from("opportunities").select("commission_agreement_status").eq("id", d.opportunity_id).maybeSingle() : { data: null };
      if (!o || o.commission_agreement_status !== "signed") return json({ ok: false, error: "commission_protection_required" }, 409);
    }

    const { data: inb } = await sb.from("communications").select("external_message_id,rfc_message_id").eq("id", d.communication_id).maybeSingle();
    let mid: string | null = inb?.rfc_message_id ? `<${inb.rfc_message_id}>` : null;
    if (!mid && inb?.external_message_id) {
      try {
        const r = await fetch(`https://api.resend.com/emails/receiving/${encodeURIComponent(inb.external_message_id)}`, { headers: { Authorization: `Bearer ${key}` } });
        if (r.ok) { const f = await r.json(); mid = f?.message_id ?? f?.headers?.["message-id"] ?? null; }
      } catch (_) { /* threading is optioneel */ }
    }
    const hdr: Record<string, string> = {};
    if (mid) { hdr["In-Reply-To"] = mid; hdr["References"] = mid; }
    const mail = renderNorthSeaMail({ body: String(d.body), mode: inferMailMode(String(d.purpose ?? d.subject ?? "")) });
    const r = await fetch("https://api.resend.com/emails", { method: "POST", headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json",
      "Idempotency-Key": `northsea-draft-${d.id}` }, body: JSON.stringify(resendPayload(d.to_email, d.subject, mail.text, mail.html, hdr)) });
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
      ...outboundProvenance({ providerMessageId: sent.id, actor: "send-approved-reply", actorType: "service", approvalBasis: "human_approved_draft", replyDraftId: d.id }),
    }).select("id").single();
    if (ce) {
      console.error("send-approved-reply: sent but communication insert failed", guardCode(ce.message) ?? ce.code ?? "");
      await audit(sb, { actor_type: "service", actor: "send-approved-reply", action: "email_sent_record_failed", approval_identity: d.approved_by, draft_id: d.id,
        opportunity_id: d.opportunity_id, company_id: d.company_id, details: { resend_email_id: sent.id, error: guardCode(ce.message) ?? "insert_failed" } });
      return json({ ok: true, draft_id: d.id, communication_id: null, resend_email_id: sent.id, record_warning: "communication_insert_failed" });
    }
    if (d.opportunity_id) await sb.from("opportunities").update({ next_action: "Await counterparty response to approved NorthSea email.", next_action_at: now }).eq("id", d.opportunity_id);
    await audit(sb, { actor_type: "service", actor: "send-approved-reply", action: "email_sent", approval_identity: d.approved_by, draft_id: d.id,
      communication_id: o.id, opportunity_id: d.opportunity_id, company_id: d.company_id, contact_id: d.contact_id,
      details: { resend_email_id: sent.id, approval_channel: d.approval_channel, requested_by: requestedBy, threaded: Boolean(mid) } });
    return json({ ok: true, draft_id: d.id, communication_id: o.id, resend_email_id: sent.id, threaded: Boolean(mid), branded_html: true, legal_footer: true });
  } catch (err) {
    console.error("send-approved-reply error", err instanceof Error ? err.message : "error");
    return json({ ok: false, error: "processing_failed" }, 500);
  }
});
