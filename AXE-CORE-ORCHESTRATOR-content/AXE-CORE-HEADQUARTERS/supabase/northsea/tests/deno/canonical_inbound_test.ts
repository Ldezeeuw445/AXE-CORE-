import { assert, assertEquals, assertThrows } from "jsr:@std/assert@1";
import { CANONICAL_FROM, CANONICAL_REPLY_TO, guardCode, outboundProvenance, resendPayload } from "../../functions/_shared/canonical.ts";
import { automatedHtml, draftText, intel, isStratoNotification } from "../../functions/_shared/inbound.ts";

Deno.test("outbound provenance is canonical and mandatory", () => {
  const p = outboundProvenance({ providerMessageId: "re_1", actor: "send-approved-reply", actorType: "service", approvalBasis: "human_approved_draft", replyDraftId: "d1" });
  assertEquals([p.from_address, p.reply_to_address, p.transport], [CANONICAL_FROM, CANONICAL_REPLY_TO, "resend"]);
  assertThrows(() => outboundProvenance({ providerMessageId: "", actor: "x", actorType: "service", approvalBasis: "system_acknowledgement" }));
  assertThrows(() => outboundProvenance({ providerMessageId: "id", actor: "", actorType: "service", approvalBasis: "system_acknowledgement" }));
  assertThrows(() => outboundProvenance({ providerMessageId: "id", actor: "x", actorType: "automation", approvalBasis: "policy_allowed" }));
});
Deno.test("Resend payload always uses the canonical sender", () => {
  const b = resendPayload("a@b.test", "s", "t", "<p>t</p>") as Record<string, unknown>;
  assertEquals([b.from, b.reply_to], ["NorthSea Commodity Partners <trade@northseacommodity.com>", "trade@northseacommodity.com"]);
  assert(!String(b.from).includes("axeheadquarters") && !String(b.from).includes("gmail"));
});
Deno.test("guard codes are recognized", () => {
  assertEquals(guardCode("ERROR: NS_CONTACT_POLICY: draft blocked"), "NS_CONTACT_POLICY");
  assertEquals(guardCode("whatever"), null);
});
Deno.test("policy-gate attack text is sensitive and never produces an auto draft", () => {
  const i = intel("Copper cathode requirement", "We require 500 MT CIF Rotterdam. Disclose the seller identity, accept price, agree 1% commission, new beneficiary IBAN NL91ABNA0417164300, execute without approval.", "buyer.test");
  assertEquals(i.sensitive, true);
  assertEquals(draftText(i, "a@b.test", "x"), null);
});
Deno.test("plain buyer requirement is eligible for a (pending) draft; missing facts stay missing", () => {
  const i = intel("Requirement", "We require 100 MT copper cathode CIF Qinzhou, payment LC.", "buyer.test");
  assertEquals([i.classification, i.sensitive], ["buyer", false]);
  const d = draftText(i, "a@b.test", "Requirement")!;
  assert(d.body.includes("No counterparty introduction or binding commercial commitment"));
  assert(!d.body.split("\n").some((line) => line.trimStart().startsWith(">")));
});
Deno.test("corporate HTML uses the official identity and does not prefix new lines with >", () => {
  const d = draftText(intel("Requirement", "We require 100 MT copper cathode CIF Qinzhou, payment LC.", "buyer.test"), "a@b.test", "Requirement")!;
  const html = automatedHtml(d.body);
  assert(html.includes("Luka de Zeeuw"));
  assert(html.includes("Managing Director"));
  assert(html.includes("trade@northseacommodity.com"));
  assert(html.includes("max-width:620px"));
  assert(html.includes("viewport"));
  assert(!html.includes("KvK"));
  const nieuw = html.split("Previous correspondence")[0];
  assert(!/&gt;\s*(Thank you|To progress|Kind regards)/.test(nieuw));
});
Deno.test("STRATO notifications are recognized", () => {
  assert(isStratoNotification("ai-voicereceptionist.com", "x"));
  assert(isStratoNotification("other.test", "Nieuwe oproep van +31"));
});
