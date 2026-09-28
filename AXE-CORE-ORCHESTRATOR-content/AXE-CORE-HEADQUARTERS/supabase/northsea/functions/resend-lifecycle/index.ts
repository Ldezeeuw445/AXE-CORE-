// resend-lifecycle v3 (P0.2): Resend-afleverstatus -> communications.
// - Het svix-signing-secret komt ALLEEN uit RESEND_LIFECYCLE_WEBHOOK_SECRET. Ontbreekt het: 503, niets verwerkt.
// - Bij een mislukte aflevering: geen taak of dealwijziging op een deal met contactbeleid (DNC/synthetic/review).
// - De draft achter de e-mail krijgt de afleverstatus in lifecycle_state.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { Webhook } from "npm:svix@1.42.0";
import { audit, outboundBlockReason } from "../_shared/db.ts";

const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { "content-type": "application/json" } });
const ALLOWED = new Set(["email.sent", "email.delivered", "email.delivery_delayed", "email.bounced", "email.failed", "email.suppressed"]);
const LIFECYCLE: Record<string, string> = { delivered: "delivered", bounced: "bounced", failed: "failed", suppressed: "failed" };

Deno.serve(async (req) => {
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405 });
  const secret = Deno.env.get("RESEND_LIFECYCLE_WEBHOOK_SECRET");
  if (!secret) return json({ ok: false, error: "webhook_secret_not_configured" }, 503);
  const raw = await req.text();
  // deno-lint-ignore no-explicit-any
  let ev: any;
  try {
    ev = new Webhook(secret).verify(raw, {
      "svix-id": req.headers.get("svix-id") ?? "",
      "svix-timestamp": req.headers.get("svix-timestamp") ?? "",
      "svix-signature": req.headers.get("svix-signature") ?? "",
    });
  } catch {
    return new Response("Invalid signature", { status: 401 });
  }
  try {
    const type = String(ev?.type ?? "");
    const data = ev?.data ?? {};
    if (!ALLOWED.has(type)) return json({ ok: true, ignored: true, type });
    const eid = String(data.email_id ?? data.id ?? "");
    if (!eid) return json({ ok: false, error: "missing_email_id" }, 400);
    const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
    const status = type.replace("email.", "");
    const now = new Date().toISOString();
    const { data: comm, error } = await sb.from("communications")
      .update({ delivery_status: status, delivery_status_at: now, provider_metadata: { event_type: type, last_event: data } })
      .eq("external_message_id", eid).select("id,opportunity_id,company_id,contact_id,reply_draft_id").maybeSingle();
    if (error) throw error;
    if (!comm) return json({ ok: true, type, status, emailId: eid, communicationId: null, matched: false });
    if (comm.reply_draft_id && LIFECYCLE[status]) {
      await sb.from("reply_drafts").update({ lifecycle_state: LIFECYCLE[status], updated_at: now }).eq("id", comm.reply_draft_id);
    }
    const opportunityId = comm.opportunity_id ?? null;
    if (opportunityId) {
      await sb.from("deal_events").insert({ opportunity_id: opportunityId, event_type: `email_${status}`, actor: "resend",
        summary: `Outbound email status: ${status}.`, metadata: { resend_email_id: eid, communication_id: comm.id, event: data } });
      if (["bounced", "failed", "suppressed"].includes(status)) {
        const reden = await outboundBlockReason(sb, { companyId: comm.company_id, contactId: comm.contact_id, opportunityId });
        if (reden) {
          await audit(sb, { actor_type: "automation", actor: "resend-lifecycle", action: "delivery_failure_followup_suppressed",
            communication_id: comm.id, opportunity_id: opportunityId, company_id: comm.company_id, details: { status, contact_policy: reden } });
        } else {
          await sb.from("opportunities").update({ next_action: "Outbound email failed. Verify the counterparty address or find an alternative verified commercial contact before continuing.",
            next_action_at: now, last_automation_at: now, waiting_since: null }).eq("id", opportunityId);
          const { data: existing } = await sb.from("deal_tasks").select("id").eq("opportunity_id", opportunityId)
            .eq("task_type", "repair_contact_channel").in("status", ["open", "in_progress"]).limit(1);
          if (!existing?.length) {
            await sb.from("deal_tasks").insert({ opportunity_id: opportunityId, task_type: "repair_contact_channel", title: "Repair failed email channel",
              description: "Verify the failed recipient address or identify a verified alternative commercial contact before sending another qualification message.",
              status: "open", priority: 90, owner: "axe", requires_approval: false, due_at: now });
          }
        }
      }
    }
    return json({ ok: true, type, status, emailId: eid, communicationId: comm.id, opportunityId });
  } catch (e) {
    console.error("resend-lifecycle", e instanceof Error ? e.message : "error");
    return json({ ok: false, error: "processing_failed" }, 500);
  }
});
