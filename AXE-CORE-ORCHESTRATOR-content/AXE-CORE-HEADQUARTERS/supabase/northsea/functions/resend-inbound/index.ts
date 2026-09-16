// resend-inbound v11 (P0.3, P0.4, P0.5, P0.6, P0.7, P0.8).
//
// Ontvangen e-mail -> opslaan -> classificeren -> deterministisch koppelen -> beslissen.
// - Automatisch versturen ALLEEN als deal_automation_policy dat toestaat (auto_send_qualification
//   EN auto_reply_nonbinding true, operational_mailbox canoniek), de koppeling deterministisch is,
//   er geen contactbeleid (DNC/synthetic/review) geldt en de inhoud niet gevoelig is. Anders:
//   een PENDING concept voor een mens, of (bij DNC/synthetic) helemaal niets.
// - Een automatische verzending heet approval_status=not_required met policy_decision; nooit "approved".
// - Een dubbelzinnige koppeling wijzigt geen deal: mapping_status=ambiguous + kandidaten + audit.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { Webhook } from "npm:svix@1.42.0";
import { guardCode, outboundProvenance, resendPayload } from "../_shared/canonical.ts";
import { audit, outboundBlockReason, readPolicy } from "../_shared/db.ts";
import { automatedHtml, domain, draftText, email, FREE_MAIL_DOMAINS, intel, isStratoNotification, strip } from "../_shared/inbound.ts";
import { type CompanyOpportunity, mapCommunication, normalizeMessageId, threadMessageIds, type ThreadMatch } from "../_shared/mapping.ts";
import { blocksHumanSend, decideAutoQualificationReply } from "../_shared/policy.ts";

const VERSION = "resend-inbound-v11";
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { "content-type": "application/json" } });

async function rget(path: string, key: string) {
  const r = await fetch(`https://api.resend.com${path}`, { headers: { Authorization: `Bearer ${key}` } });
  const t = await r.text();
  // deno-lint-ignore no-explicit-any
  let x: any;
  try { x = t ? JSON.parse(t) : null; } catch { x = { raw: t }; }
  if (!r.ok) throw new Error(`Resend ${r.status}`);
  return x;
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405 });
  try {
    const sec = Deno.env.get("RESEND_WEBHOOK_SECRET"), key = Deno.env.get("RESEND_API_KEY");
    if (!sec || !key) return json({ ok: false, error: "secrets" }, 503);
    const raw = await req.text();
    // deno-lint-ignore no-explicit-any
    let ev: any;
    try {
      ev = new Webhook(sec).verify(raw, { "svix-id": req.headers.get("svix-id") ?? "", "svix-timestamp": req.headers.get("svix-timestamp") ?? "", "svix-signature": req.headers.get("svix-signature") ?? "" });
    } catch {
      return new Response("Invalid signature", { status: 401 });
    }
    if (ev?.type !== "email.received") return json({ ok: true, ignored: true });
    const data = ev.data ?? {}, eid = String(data.email_id ?? data.id ?? "");
    if (!eid) return json({ ok: false, error: "missing_email_id" }, 400);
    const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
    const { data: old } = await sb.from("communications").select("id").eq("external_message_id", eid).maybeSingle();
    if (old) return json({ ok: true, duplicate: true, communicationId: old.id });

    const f = await rget(`/emails/receiving/${encodeURIComponent(eid)}`, key);
    const sender = email(f.from ?? data.from), sd = domain(sender), subject = f.subject ? String(f.subject) : null;
    const body = (f.text && String(f.text).trim()) || strip(f.html) || null, when = f.created_at ?? new Date().toISOString();
    const headers = (f.headers && typeof f.headers === "object") ? f.headers : {};
    const rfcId = normalizeMessageId(f.message_id ?? headers["message-id"]);

    // STRATO-frontdesk: opslaan als telefonische intake, nooit automatisch mailen.
    if (isStratoNotification(sd, subject)) {
      const { data: c } = await sb.from("communications").insert({ direction: "inbound", channel: "phone", subject, body, external_message_id: eid,
        occurred_at: when, rfc_message_id: rfcId, mapping_status: "unmapped", mapping_basis: "voice_frontdesk_notification" }).select("id").single();
      return json({ ok: true, source: "strato", communicationId: c?.id, autoSent: false });
    }

    // Tegenpartij: bestaand contact; anders bedrijfsdomein (nooit een gratis maildomein).
    let companyId: string | null = null, contactId: string | null = null, companySynthetic = false;
    if (sender) {
      const { data: c } = await sb.from("contacts").select("id,company_id").ilike("email", sender).limit(1).maybeSingle();
      if (c) { contactId = c.id; companyId = c.company_id; }
      else if (sd && !FREE_MAIL_DOMAINS.has(sd)) {
        const { data: dc } = await sb.from("companies").select("id").or(`website.ilike.%${sd}%,source_url.ilike.%${sd}%`).limit(2);
        if (dc?.length === 1) companyId = dc[0].id;
        else if (!dc?.length) {
          const { data: cc } = await sb.from("companies").insert({ company_name: sd, company_type: "other", verification_status: "unverified", source_type: "inbound_email",
            notes: `Auto-created from inbound email domain ${sd}; legal entity not independently verified.` }).select("id").single();
          companyId = cc?.id ?? null;
        }
        if (companyId) {
          const display = String(f.from ?? sender).replace(/<[^>]+>/, "").trim();
          const { data: ct } = await sb.from("contacts").insert({ company_id: companyId, full_name: display || sender, email: sender, is_primary: false,
            verification_status: "unverified", notes: "Auto-created from inbound email; identity not independently verified." }).select("id").single();
          contactId = ct?.id ?? null;
        }
      }
    }
    if (companyId) {
      const { data: co } = await sb.from("companies").select("is_synthetic").eq("id", companyId).maybeSingle();
      companySynthetic = !!co?.is_synthetic;
    }

    // Deterministische koppeling.
    const ids = threadMessageIds(headers["in-reply-to"], headers["references"]);
    let threadMatches: ThreadMatch[] = [];
    if (ids.length) {
      const { data: tm } = await sb.from("communications").select("id,opportunity_id,is_synthetic").in("rfc_message_id", ids);
      threadMatches = (tm ?? []).map((x: { id: string; opportunity_id: string | null; is_synthetic: boolean }) => ({ communication_id: x.id, opportunity_id: x.opportunity_id, is_synthetic: !!x.is_synthetic }));
    }
    let companyOpps: CompanyOpportunity[] = [];
    if (companyId) {
      const [{ data: br }, { data: so }] = await Promise.all([sb.from("buyer_requirements").select("id").eq("company_id", companyId), sb.from("supplier_offers").select("id").eq("company_id", companyId)]);
      const fs: string[] = [];
      if (br?.length) fs.push(`buyer_requirement_id.in.(${br.map((x: { id: string }) => x.id).join(",")})`);
      if (so?.length) fs.push(`supplier_offer_id.in.(${so.map((x: { id: string }) => x.id).join(",")})`);
      if (fs.length) {
        const { data: o } = await sb.from("opportunities").select("id,stage,is_synthetic").or(fs.join(",")).limit(200);
        companyOpps = (o ?? []) as CompanyOpportunity[];
      }
    }
    const mapping = mapCommunication({ companyId, companySynthetic, threadMatches, companyOpportunities: companyOpps });
    const opportunityId = mapping.status === "mapped" ? mapping.opportunity_id : null;

    const { data: comm, error: ce } = await sb.from("communications").insert({
      company_id: companyId, contact_id: contactId, opportunity_id: opportunityId, direction: "inbound", channel: "email", subject, body,
      external_message_id: eid, occurred_at: when, rfc_message_id: rfcId, mapping_status: mapping.status, mapping_basis: mapping.basis,
      mapping_candidates: mapping.candidates.length ? mapping.candidates : null, is_synthetic: mapping.status === "synthetic",
      synthetic_reason: mapping.status === "synthetic" ? `inbound mapped to synthetic record (${mapping.basis})` : null,
    }).select("id").single();
    if (ce) throw ce;

    const i = intel(subject, body, sd);
    const blockReason = await outboundBlockReason(sb, { companyId, contactId, email: sender, opportunityId });
    const policyRead = await readPolicy(sb);
    const decision = decideAutoQualificationReply({ policyRead, classification: i.classification, sensitive: i.sensitive, mappingStatus: mapping.status,
      blockReason, synthetic: mapping.status === "synthetic" || companySynthetic, recipient: sender });

    await sb.from("email_intelligence").upsert({ communication_id: comm.id, company_id: companyId, contact_id: contactId, opportunity_id: opportunityId,
      classification: i.classification, commercial_intent: i.classification === "supplier" ? "offer_supply" : i.classification === "buyer" ? "source_product" : "general_inquiry",
      urgency: "normal", risk_level: i.sensitive ? "high" : "low", qualification_score: i.score, summary: (body ?? subject ?? "Inbound email").slice(0, 1000),
      extracted_terms: i.terms, missing_information: i.missing, red_flags: i.sensitive ? ["potential approval-gated content detected"] : [],
      recommended_action: i.action, requires_human_approval: !decision.allowed, status: "analyzed", analyzed_at: new Date().toISOString(),
      updated_at: new Date().toISOString() }, { onConflict: "communication_id" });

    if (mapping.status === "ambiguous") {
      await audit(sb, { actor_type: "automation", actor: VERSION, action: "communication_mapping_ambiguous", communication_id: comm.id, company_id: companyId,
        contact_id: contactId, details: { basis: mapping.basis, candidates: mapping.candidates, note: "No opportunity was changed; manual review required." } });
    }

    const d = draftText(i, sender, subject);
    let autoSent = false, sentId: string | null = null, draftId: string | null = null, draftOutcome = "none";
    if (d && blocksHumanSend(blockReason)) {
      draftOutcome = "suppressed_contact_policy";
      await audit(sb, { actor_type: "automation", actor: VERSION, action: "outbound_suppressed", policy_decision: decision, communication_id: comm.id,
        company_id: companyId, contact_id: contactId, opportunity_id: opportunityId, details: { contact_policy: blockReason } });
    } else if (d && decision.allowed) {
      const { data: rd, error: de } = await sb.from("reply_drafts").insert({ communication_id: comm.id, company_id: companyId, contact_id: contactId, opportunity_id: opportunityId,
        to_email: d.to, subject: d.subject, body: d.body, purpose: i.action, approval_status: "not_required", lifecycle_state: "policy_allowed",
        policy_decision: decision, sensitive_action: false, generated_by: VERSION }).select("id").single();
      if (de) throw de;
      draftId = rd.id;
      const hdr: Record<string, string> = { "X-NorthSea-Automation": "policy-allowed-qualification" };
      if (rfcId) { hdr["In-Reply-To"] = `<${rfcId}>`; hdr["References"] = `<${rfcId}>`; }
      const r = await fetch("https://api.resend.com/emails", { method: "POST", headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json",
        "Idempotency-Key": `northsea-auto-${rd.id}` }, body: JSON.stringify(resendPayload(d.to, d.subject, d.body, automatedHtml(d.body), hdr)) });
      const x = await r.json().catch(() => null);
      if (!r.ok || !x?.id) {
        await sb.from("reply_drafts").update({ lifecycle_state: "failed", updated_at: new Date().toISOString() }).eq("id", rd.id);
        throw new Error(`send failed ${r.status}`);
      }
      sentId = x.id; autoSent = true; draftOutcome = "policy_allowed_sent";
      const now = new Date().toISOString();
      await sb.from("reply_drafts").update({ sent_at: now, resend_email_id: sentId, lifecycle_state: "sent", updated_at: now }).eq("id", rd.id);
      await sb.from("communications").insert({ company_id: companyId, contact_id: contactId, opportunity_id: opportunityId, direction: "outbound", channel: "email",
        subject: d.subject, body: d.body, occurred_at: now, mapping_status: mapping.status, mapping_basis: mapping.basis,
        ...outboundProvenance({ providerMessageId: sentId!, actor: VERSION, actorType: "automation", approvalBasis: "policy_allowed", replyDraftId: rd.id }) });
      if (opportunityId) {
        await sb.from("opportunities").update({ execution_state: "qualifying", next_action: "Await counterparty response to automated non-binding qualification email.",
          next_action_at: now, last_automation_at: now, waiting_since: now }).eq("id", opportunityId);
        await sb.from("deal_events").insert({ opportunity_id: opportunityId, event_type: "policy_allowed_qualification_email_sent", actor: VERSION,
          summary: "Policy-allowed non-binding qualification reply sent from trade@northseacommodity.com (no human approval).", metadata: { resend_email_id: sentId, inbound_email_id: eid, draft_id: rd.id } });
      }
    } else if (d) {
      const { data: rd, error: de } = await sb.from("reply_drafts").insert({ communication_id: comm.id, company_id: companyId, contact_id: contactId, opportunity_id: opportunityId,
        to_email: d.to, subject: d.subject, body: d.body, purpose: i.action, approval_status: "pending", lifecycle_state: "approval_required",
        policy_decision: decision, sensitive_action: false, generated_by: VERSION }).select("id").single();
      if (de) {
        if (guardCode(de.message) === "NS_CONTACT_POLICY") draftOutcome = "suppressed_contact_policy";
        else throw de;
      } else { draftId = rd.id; draftOutcome = "pending_human_approval"; }
    }

    if (opportunityId && i.sensitive) {
      const now = new Date().toISOString();
      await sb.from("opportunities").update({ approval_required: true, approval_type: "communication_review",
        next_action: "Review inbound message: potential approval-gated commercial or identity-sensitive content.", next_action_at: now, last_automation_at: now }).eq("id", opportunityId);
      await sb.from("deal_events").insert({ opportunity_id: opportunityId, event_type: "approval_gate_triggered", actor: VERSION,
        summary: "Inbound email contains potentially sensitive/binding content; no automatic reply sent.", metadata: { inbound_email_id: eid } });
    }
    await audit(sb, { actor_type: "automation", actor: VERSION, action: "inbound_processed", policy_decision: decision, communication_id: comm.id,
      company_id: companyId, contact_id: contactId, opportunity_id: opportunityId, draft_id: draftId,
      details: { classification: i.classification, mapping: { status: mapping.status, basis: mapping.basis }, contact_policy: blockReason, draft_outcome: draftOutcome, auto_sent: autoSent } });

    return json({ ok: true, emailId: eid, communicationId: comm.id, opportunityId, mapping: mapping.status, classification: i.classification,
      autoSent, sentId, draftOutcome, policyAllowed: decision.allowed, policyReasons: decision.reasons });
  } catch (e) {
    console.error(VERSION, e instanceof Error ? e.message : "error");
    return json({ ok: false, error: "processing_failed" }, 500);
  }
});
