import { assert, assertEquals } from "jsr:@std/assert@1";
import { blocksHumanSend, decideAutoQualificationReply, needsHumanApproval, parsePolicy, type PolicyRead } from "../../functions/_shared/policy.ts";

const row = (over: Record<string, unknown> = {}) => ({ auto_send_qualification: true, auto_send_followups: false, auto_reply_nonbinding: true,
  auto_disclose_counterparty_identity: false, auto_accept_pricing: false, auto_sign_documents: false, auto_change_banking: false,
  operational_mailbox: "trade@northseacommodity.com", ...over });
const base = (policyRead: PolicyRead, over = {}) => ({ policyRead, classification: "supplier", sensitive: false, mappingStatus: "mapped" as const,
  blockReason: null, synthetic: false, recipient: "a@b.test", ...over });

Deno.test("production policy (both false) -> no send", () => {
  const d = decideAutoQualificationReply(base(parsePolicy(row({ auto_send_qualification: false, auto_reply_nonbinding: false, operational_mailbox: null }))));
  assertEquals(d.allowed, false);
  assert(d.reasons.includes("auto_send_qualification_disabled") && d.reasons.includes("auto_reply_nonbinding_disabled"));
});
Deno.test("auto_send_qualification=false alone blocks", () => {
  assertEquals(decideAutoQualificationReply(base(parsePolicy(row({ auto_send_qualification: false })))).allowed, false);
});
Deno.test("auto_reply_nonbinding=false alone blocks", () => {
  assertEquals(decideAutoQualificationReply(base(parsePolicy(row({ auto_reply_nonbinding: false })))).allowed, false);
});
Deno.test("missing or malformed policy fails closed (no default-to-send)", () => {
  for (const bad of [null, undefined, [], {}, row({ auto_send_qualification: "true" }), row({ auto_reply_nonbinding: 1 }), row({ operational_mailbox: 5 })]) {
    const p = parsePolicy(bad);
    assertEquals(p.ok, false);
    const d = decideAutoQualificationReply(base(p));
    assertEquals(d.allowed, false);
    assert(d.reasons.some((r) => r.startsWith("policy_unavailable")));
  }
});
Deno.test("non-canonical operational mailbox blocks", () => {
  for (const m of [null, "", "support@axeheadquarters.com", "lukadezeeuw205@gmail.com"]) {
    assertEquals(decideAutoQualificationReply(base(parsePolicy(row({ operational_mailbox: m })))).allowed, false);
  }
});
Deno.test("everything allowed only when all conditions hold", () => {
  assertEquals(decideAutoQualificationReply(base(parsePolicy(row()))).allowed, true);
  assertEquals(decideAutoQualificationReply(base(parsePolicy(row()), { mappingStatus: "unmapped" })).allowed, true);
});
Deno.test("each blocker blocks independently", () => {
  const ok = parsePolicy(row());
  const cases: Record<string, unknown>[] = [
    { blockReason: "do_not_contact" }, { blockReason: "review_required" }, { blockReason: "synthetic" }, { synthetic: true },
    { mappingStatus: "ambiguous" }, { mappingStatus: "manual_review" }, { mappingStatus: "synthetic" }, { sensitive: true },
    { classification: "broker" }, { classification: "unknown" }, { recipient: null },
  ];
  for (const c of cases) assertEquals(decideAutoQualificationReply(base(ok, c)).allowed, false, JSON.stringify(c));
});
Deno.test("human send: review_required allowed, dnc/synthetic never", () => {
  assertEquals([blocksHumanSend(null), blocksHumanSend("review_required"), blocksHumanSend("do_not_contact"), blocksHumanSend("synthetic"), blocksHumanSend("bounced_channel")], [false, false, true, true, true]);
});
Deno.test("human-approval flag is quiet unless sensitive, ambiguous, or a blocked safe draft", () => {
  const quiet = { sensitive: false, mappingStatus: "unmapped" as const, hasSafeDraft: false, policyAllowed: false, blockReason: null };
  assertEquals(needsHumanApproval(quiet), false);
  assertEquals(needsHumanApproval({ ...quiet, sensitive: true }), true);
  assertEquals(needsHumanApproval({ ...quiet, mappingStatus: "ambiguous" }), true);
  assertEquals(needsHumanApproval({ ...quiet, hasSafeDraft: true }), true);
  assertEquals(needsHumanApproval({ ...quiet, hasSafeDraft: true, policyAllowed: true }), false);
  assertEquals(needsHumanApproval({ ...quiet, hasSafeDraft: true, blockReason: "do_not_contact" }), false);
});
