import { assertEquals } from "jsr:@std/assert@1";
import { mapCommunication, threadMessageIds } from "../../functions/_shared/mapping.ts";

const opp = (id: string, stage = "identified", is_synthetic = false) => ({ id, stage, is_synthetic });
const base = { companyId: "co", companySynthetic: false, threadMatches: [], companyOpportunities: [] };

Deno.test("one clear match (single open deal) -> mapped", () => {
  const m = mapCommunication({ ...base, companyOpportunities: [opp("o1")] });
  assertEquals([m.status, m.opportunity_id, m.basis], ["mapped", "o1", "counterparty_single_open_opportunity"]);
});
Deno.test("same company with multiple open opportunities -> ambiguous, no deal chosen", () => {
  const m = mapCommunication({ ...base, companyOpportunities: [opp("o2"), opp("o1"), opp("o3", "lost")] });
  assertEquals([m.status, m.opportunity_id, m.candidates], ["ambiguous", null, ["o1", "o2"]]);
});
Deno.test("no deal -> unmapped", () => {
  assertEquals(mapCommunication({ ...base, companyOpportunities: [opp("o9", "lost")] }).status, "unmapped");
  assertEquals(mapCommunication({ ...base, companyId: null }).basis, "unknown_counterparty");
});
Deno.test("reply in known thread wins over counterparty heuristics", () => {
  const m = mapCommunication({ ...base, threadMatches: [{ communication_id: "c1", opportunity_id: "o2", is_synthetic: false }],
    companyOpportunities: [opp("o1"), opp("o2")] });
  assertEquals([m.status, m.opportunity_id, m.basis], ["mapped", "o2", "thread"]);
});
Deno.test("thread pointing at two different deals -> ambiguous", () => {
  const m = mapCommunication({ ...base, threadMatches: [{ communication_id: "c1", opportunity_id: "o1", is_synthetic: false }, { communication_id: "c2", opportunity_id: "o2", is_synthetic: false }] });
  assertEquals([m.status, m.opportunity_id], ["ambiguous", null]);
});
Deno.test("new thread from known counterparty with one deal -> mapped by counterparty", () => {
  const m = mapCommunication({ ...base, threadMatches: [], companyOpportunities: [opp("o7")] });
  assertEquals([m.status, m.basis], ["mapped", "counterparty_single_open_opportunity"]);
});
Deno.test("synthetic counterparty or synthetic-only deals never map to a live deal", () => {
  assertEquals(mapCommunication({ ...base, companySynthetic: true, companyOpportunities: [opp("o1")] }).status, "synthetic");
  assertEquals(mapCommunication({ ...base, companyOpportunities: [opp("s1", "identified", true)] }).status, "unmapped");
  assertEquals(mapCommunication({ ...base, threadMatches: [{ communication_id: "c", opportunity_id: "s1", is_synthetic: true }] }).status, "synthetic");
});
Deno.test("DNC counterparty still maps deterministically (sending is blocked elsewhere)", () => {
  assertEquals(mapCommunication({ ...base, companyOpportunities: [opp("dnc-deal")] }).opportunity_id, "dnc-deal");
});
Deno.test("message ids parsed from headers", () => {
  assertEquals(threadMessageIds("<A@x>", "<b@y> <a@x>"), ["a@x", "b@y"]);
  assertEquals(threadMessageIds(undefined, ["<c@z>"]), ["c@z"]);
});
