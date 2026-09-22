// resend-reconcile-outbound v1
//
// Repairs a factual journal gap: an email may exist in Resend even when the
// corresponding NorthSea communications row was never written.
//
// Safety properties:
// - defaults to dry-run; commit=true is explicit;
// - NEVER sends mail;
// - only imports messages whose sender mailbox is trade@northseacommodity.com;
// - never guesses a deal/company/contact. Those ids are reused only when an
//   existing reply_draft has the exact Resend email id;
// - provider_reconciled means "historical provider fact", NOT approval;
// - canonical normalized sender/reply-to live in first-class columns; the raw
//   provider metadata is preserved under provider_metadata;
// - external_message_id is already uniquely indexed, making reruns idempotent.

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { CANONICAL_FROM, CANONICAL_REPLY_TO, outboundProvenance } from "../_shared/canonical.ts";
import { audit } from "../_shared/db.ts";
import { email, strip } from "../_shared/inbound.ts";
import { normalizeMessageId } from "../_shared/mapping.ts";

const VERSION = "resend-reconcile-outbound-v1";
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { "content-type": "application/json", "cache-control": "no-store" } });

type SentListItem = {
  id?: string;
  message_id?: string | null;
  from?: string | null;
  to?: string[] | string | null;
  reply_to?: string[] | string | null;
  subject?: string | null;
  created_at?: string | null;
  last_event?: string | null;
  scheduled_at?: string | null;
};

async function resendGet(path: string, key: string): Promise<Record<string, unknown>> {
  const r = await fetch(`https://api.resend.com${path}`, { headers: { Authorization: `Bearer ${key}` } });
  const body = await r.json().catch(() => null);
  if (!r.ok || !body || typeof body !== "object") throw new Error(`resend_get_failed:${r.status}`);
  return body as Record<string, unknown>;
}

function canonicalSender(v: unknown): boolean {
  return email(v) === CANONICAL_REPLY_TO;
}

function asList(v: unknown): string[] {
  if (Array.isArray(v)) return v.map(String).filter(Boolean);
  return v ? [String(v)] : [];
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return json({ ok: false, error: "method_not_allowed" }, 405);

  const serviceRole = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!serviceRole || req.headers.get("authorization") !== `Bearer ${serviceRole}`) {
    return json({ ok: false, error: "forbidden" }, 403);
  }
  const resendKey = Deno.env.get("RESEND_API_KEY");
  if (!resendKey) return json({ ok: false, error: "resend_not_configured" }, 503);

  const input = await req.json().catch(() => ({})) as Record<string, unknown>;
  const commit = input.commit === true;
  const maxPages = Math.max(1, Math.min(5, Number(input.max_pages ?? 2) || 2));
  const sb = createClient(Deno.env.get("SUPABASE_URL")!, serviceRole, { auth: { persistSession: false } });

  try {
    const sent: SentListItem[] = [];
    let after: string | null = null;
    for (let page = 0; page < maxPages; page++) {
      const qs = new URLSearchParams({ limit: "100" });
      if (after) qs.set("after", after);
      const payload = await resendGet(`/emails?${qs.toString()}`, resendKey);
      const rows = Array.isArray(payload.data) ? payload.data as SentListItem[] : [];
      const ours = rows.filter((x) => x.id && canonicalSender(x.from));
      sent.push(...ours);
      if (payload.has_more !== true || rows.length === 0) break;
      after = String(rows[rows.length - 1]?.id ?? "");
      if (!after) break;
    }

    const providerIds = [...new Set(sent.map((x) => String(x.id ?? "")).filter(Boolean))];
    if (!providerIds.length) return json({ ok: true, commit, scanned: 0, missing: 0, reconciled: 0, rows: [] });

    const { data: existing, error: ee } = await sb.from("communications")
      .select("external_message_id").in("external_message_id", providerIds);
    if (ee) throw ee;
    const known = new Set((existing ?? []).map((x: { external_message_id: string | null }) => x.external_message_id).filter(Boolean));

    const missing = sent.filter((x) => x.id && !known.has(String(x.id)));
    const missingIds = missing.map((x) => String(x.id));
    const drafts = new Map<string, Record<string, unknown>>();
    if (missingIds.length) {
      const { data: dr, error: de } = await sb.from("reply_drafts").select(
        "id,resend_email_id,company_id,contact_id,opportunity_id,to_email"
      ).in("resend_email_id", missingIds);
      if (de) throw de;
      for (const d of dr ?? []) if (d.resend_email_id) drafts.set(String(d.resend_email_id), d);
    }

    const report = missing.map((x) => ({
      resend_email_id: String(x.id),
      created_at: x.created_at ?? null,
      subject: x.subject ?? null,
      to: asList(x.to),
      status: x.last_event ?? null,
      reply_draft_match: drafts.has(String(x.id)),
    }));

    if (!commit) {
      return json({ ok: true, commit: false, scanned: providerIds.length, missing: missing.length, reconciled: 0, rows: report });
    }

    const reconciled: Array<Record<string, unknown>> = [];
    const failed: Array<Record<string, unknown>> = [];

    for (const item of missing) {
      const id = String(item.id ?? "");
      if (!id) continue;
      try {
        // Re-check idempotency at the last responsible moment. The unique index
        // remains the final race guard if two repair runs overlap.
        const { data: already } = await sb.from("communications").select("id").eq("external_message_id", id).maybeSingle();
        if (already) continue;

        const detail = await resendGet(`/emails/${encodeURIComponent(id)}`, resendKey) as SentListItem & Record<string, unknown>;
        if (!canonicalSender(detail.from ?? item.from)) {
          failed.push({ resend_email_id: id, error: "sender_not_canonical" });
          continue;
        }

        const draft = drafts.get(id);
        const text = typeof detail.text === "string" && detail.text.trim()
          ? detail.text
          : strip(typeof detail.html === "string" ? detail.html : null);
        const rawTo = asList(detail.to ?? item.to);
        const messageId = normalizeMessageId(detail.message_id ?? item.message_id);

        const { data: inserted, error: ie } = await sb.from("communications").insert({
          company_id: draft?.company_id ?? null,
          contact_id: draft?.contact_id ?? null,
          opportunity_id: draft?.opportunity_id ?? null,
          direction: "outbound",
          channel: "email",
          subject: String(detail.subject ?? item.subject ?? "") || null,
          body: text,
          occurred_at: detail.created_at ?? item.created_at ?? new Date().toISOString(),
          rfc_message_id: messageId,
          delivery_status: detail.last_event ?? item.last_event ?? null,
          mapping_status: draft?.opportunity_id ? "mapped" : "unmapped",
          mapping_basis: draft?.opportunity_id ? "reply_draft_resend_email_id" : "provider_reconciliation",
          provider_metadata: {
            reconciled: true,
            reconciled_by: VERSION,
            raw_from: detail.from ?? item.from ?? null,
            to: rawTo,
            reply_to: asList(detail.reply_to ?? item.reply_to),
            cc: asList(detail.cc),
            bcc: asList(detail.bcc),
            last_event: detail.last_event ?? item.last_event ?? null,
            scheduled_at: detail.scheduled_at ?? item.scheduled_at ?? null,
            message_id: detail.message_id ?? item.message_id ?? null,
          },
          ...outboundProvenance({
            providerMessageId: id,
            actor: VERSION,
            actorType: "service",
            approvalBasis: "provider_reconciled",
            replyDraftId: draft?.id ? String(draft.id) : null,
          }),
        }).select("id").single();

        if (ie) {
          // A concurrent repair can legitimately win the unique-index race.
          const { data: raced } = await sb.from("communications").select("id").eq("external_message_id", id).maybeSingle();
          if (raced) continue;
          throw ie;
        }

        await audit(sb, {
          actor_type: "service",
          actor: VERSION,
          action: "outbound_provider_reconciled",
          communication_id: inserted.id,
          opportunity_id: draft?.opportunity_id ? String(draft.opportunity_id) : null,
          company_id: draft?.company_id ? String(draft.company_id) : null,
          contact_id: draft?.contact_id ? String(draft.contact_id) : null,
          draft_id: draft?.id ? String(draft.id) : null,
          details: { resend_email_id: id, mapping: draft ? "reply_draft_exact" : "unmapped", historical_fact_only: true },
        });
        reconciled.push({ resend_email_id: id, communication_id: inserted.id, opportunity_id: draft?.opportunity_id ?? null });
      } catch (e) {
        failed.push({ resend_email_id: id, error: e instanceof Error ? e.message.slice(0, 160) : "reconcile_failed" });
      }
    }

    return json({
      ok: failed.length === 0,
      commit: true,
      scanned: providerIds.length,
      missing: missing.length,
      reconciled: reconciled.length,
      failed,
      rows: reconciled,
    }, failed.length ? 207 : 200);
  } catch (e) {
    console.error(VERSION, e instanceof Error ? e.message : "error");
    return json({ ok: false, error: "reconciliation_failed" }, 500);
  }
});
