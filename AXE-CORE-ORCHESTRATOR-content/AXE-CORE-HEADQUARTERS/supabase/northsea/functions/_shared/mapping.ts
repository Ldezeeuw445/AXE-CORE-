// P0.7 Communicatie -> deal koppelen, deterministisch.
//
// Voorrang:
//   1. synthetische tegenpartij             -> synthetic (nooit een live deal)
//   2. bekende thread (In-Reply-To/References op een eerder bericht met een deal)
//        precies 1 deal -> mapped (thread); meer dan 1 -> ambiguous
//   3. bekende tegenpartij (contact -> bedrijf) met open deals
//        precies 1 open, niet-synthetische deal -> mapped (counterparty_single_open_opportunity)
//        meer dan 1 -> ambiguous (kandidaten, GEEN keuze)
//        0 -> unmapped
//   4. onbekende afzender -> unmapped
// Bij ambiguous/unmapped/synthetic wordt geen enkele deal gewijzigd.

import type { MappingStatus } from "./policy.ts";

export interface ThreadMatch {
  communication_id: string;
  opportunity_id: string | null;
  is_synthetic: boolean;
}

export interface CompanyOpportunity {
  id: string;
  stage: string | null;
  is_synthetic: boolean;
}

export interface MappingInput {
  companyId: string | null;
  companySynthetic: boolean;
  threadMatches: ThreadMatch[];
  companyOpportunities: CompanyOpportunity[];
}

export interface Mapping {
  status: MappingStatus;
  opportunity_id: string | null;
  basis: string;
  candidates: string[];
}

const CLOSED = new Set(["lost", "won"]);

export function mapCommunication(i: MappingInput): Mapping {
  if (i.companySynthetic) return { status: "synthetic", opportunity_id: null, basis: "synthetic_counterparty", candidates: [] };

  const threadDeals = [...new Set(i.threadMatches.filter((t) => t.opportunity_id && !t.is_synthetic).map((t) => t.opportunity_id as string))];
  const threadSynthetic = i.threadMatches.some((t) => t.is_synthetic);
  if (threadDeals.length === 1) return { status: "mapped", opportunity_id: threadDeals[0], basis: "thread", candidates: threadDeals };
  if (threadDeals.length > 1) return { status: "ambiguous", opportunity_id: null, basis: "thread_conflict", candidates: threadDeals.sort() };
  if (threadSynthetic && threadDeals.length === 0) return { status: "synthetic", opportunity_id: null, basis: "synthetic_thread", candidates: [] };

  if (!i.companyId) return { status: "unmapped", opportunity_id: null, basis: "unknown_counterparty", candidates: [] };
  const open = [...new Set(i.companyOpportunities.filter((o) => !o.is_synthetic && !CLOSED.has(o.stage ?? "")).map((o) => o.id))].sort();
  if (open.length === 1) return { status: "mapped", opportunity_id: open[0], basis: "counterparty_single_open_opportunity", candidates: open };
  if (open.length > 1) return { status: "ambiguous", opportunity_id: null, basis: "counterparty_multiple_open_opportunities", candidates: open };
  return { status: "unmapped", opportunity_id: null, basis: "counterparty_no_open_opportunity", candidates: [] };
}

/** Message-IDs uit In-Reply-To/References, genormaliseerd zonder hoekhaken. */
export function threadMessageIds(inReplyTo: unknown, references: unknown): string[] {
  const tekst = [inReplyTo, references].map((v) => (Array.isArray(v) ? v.join(" ") : typeof v === "string" ? v : "")).join(" ");
  const ids = [...tekst.matchAll(/<([^<>\s]+)>/g)].map((m) => m[1].trim().toLowerCase());
  return [...new Set(ids)].slice(0, 50);
}

export function normalizeMessageId(id: unknown): string | null {
  if (typeof id !== "string" || !id.trim()) return null;
  return id.trim().replace(/^<|>$/g, "").toLowerCase();
}
