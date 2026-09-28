import { assert, assertEquals } from "jsr:@std/assert@1";
import { asList, exactDraftLinkage, isCanonicalSender, pageLimit, wantsCommit } from "../../functions/_shared/reconcile.ts";

const RECONCILE_SRC = await Deno.readTextFile(
  new URL("../../functions/resend-reconcile-outbound/index.ts", import.meta.url),
);
const INBOUND_SRC = await Deno.readTextFile(
  new URL("../../functions/resend-inbound/index.ts", import.meta.url),
);

Deno.test("reconcile defaults to dry-run unless commit is the boolean true", () => {
  assertEquals(wantsCommit(undefined), false);
  assertEquals(wantsCommit({}), false);
  assertEquals(wantsCommit({ commit: false }), false);
  assertEquals(wantsCommit({ commit: "true" }), false);
  assertEquals(wantsCommit({ commit: 1 }), false);
  assertEquals(wantsCommit({ commit: true }), true);
});

Deno.test("reconcile page limit stays bounded", () => {
  assertEquals(pageLimit({}), 2);
  assertEquals(pageLimit({ max_pages: 99 }), 5);
  assertEquals(pageLimit({ max_pages: 0 }), 2);
  assertEquals(pageLimit({ max_pages: "nope" }), 2);
});

Deno.test("only the canonical NorthSea mailbox is imported", () => {
  assert(isCanonicalSender("NorthSea Commodity Partners <trade@northseacommodity.com>"));
  assert(isCanonicalSender("trade@northseacommodity.com"));
  assert(!isCanonicalSender("support@axeheadquarters.com"));
  assert(!isCanonicalSender("someone@supplier.test"));
  assert(!isCanonicalSender(null));
});

Deno.test("deal/company/contact linkage is exact reply_draft or unmapped — never guessed", () => {
  assertEquals(exactDraftLinkage(undefined), {
    company_id: null,
    contact_id: null,
    opportunity_id: null,
    mapping_status: "unmapped",
    mapping_basis: "provider_reconciliation",
  });
  assertEquals(exactDraftLinkage({ company_id: "c1", contact_id: "k1" }), {
    company_id: "c1",
    contact_id: "k1",
    opportunity_id: null,
    mapping_status: "unmapped",
    mapping_basis: "provider_reconciliation",
  });
  assertEquals(exactDraftLinkage({ company_id: "c1", contact_id: "k1", opportunity_id: "o1", id: "d1" }), {
    company_id: "c1",
    contact_id: "k1",
    opportunity_id: "o1",
    mapping_status: "mapped",
    mapping_basis: "reply_draft_resend_email_id",
  });
});

Deno.test("asList normalizes Resend to/cc/bcc shapes", () => {
  assertEquals(asList(["a@b.test", ""]), ["a@b.test"]);
  assertEquals(asList("a@b.test"), ["a@b.test"]);
  assertEquals(asList(null), []);
});

Deno.test("reconcile source never sends mail and only GETs Resend history", () => {
  assert(!/method:\s*["']POST["']/.test(RECONCILE_SRC));
  assert(!/resendPayload\(/.test(RECONCILE_SRC));
  assert(!/auto_send_(qualification|followups)|auto_reply_nonbinding/.test(RECONCILE_SRC));
  const fetches = [...RECONCILE_SRC.matchAll(/fetch\(([\s\S]*?)\)/g)].map((m) => m[1]);
  assert(fetches.length >= 1);
  for (const args of fetches) {
    assert(!/method\s*:/.test(args), `unexpected fetch options: ${args.slice(0, 120)}`);
  }
  assert(RECONCILE_SRC.includes("wantsCommit("));
  assert(RECONCILE_SRC.includes("if (!commit)"));
  assert(RECONCILE_SRC.includes("exactDraftLinkage("));
});

Deno.test("inbound still gates automatic send on policy, not on the quieter approval flag", () => {
  assert(INBOUND_SRC.includes("decideAutoQualificationReply"));
  assert(INBOUND_SRC.includes("else if (d && decision.allowed)"));
  assert(INBOUND_SRC.includes("needsHumanApproval("));
  assert(!INBOUND_SRC.includes("requires_human_approval: !decision.allowed"));
});
