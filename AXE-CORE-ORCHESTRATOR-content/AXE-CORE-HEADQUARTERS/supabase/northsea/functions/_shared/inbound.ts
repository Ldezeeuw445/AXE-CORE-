// Pure logica van resend-inbound: afzender, classificatie, extractie, concept-tekst.
// Overgenomen uit v10 (gedrag van de classificatie ongewijzigd), zonder bijwerkingen.

import { renderNorthSeaMail } from "./mail.ts";

export const FREE_MAIL_DOMAINS = new Set([
  "gmail.com", "googlemail.com", "outlook.com", "hotmail.com", "live.com", "msn.com", "yahoo.com", "icloud.com", "me.com",
  "aol.com", "proton.me", "protonmail.com", "gmx.com", "gmx.de", "web.de", "mail.com", "yandex.com", "qq.com", "163.com",
]);

export function email(v: unknown): string | null {
  if (!v) return null;
  const r = Array.isArray(v) ? String(v[0] ?? "") : String(v);
  const m = r.match(/<([^>]+)>/);
  return (m ? m[1] : r).trim().toLowerCase() || null;
}

export function domain(e: string | null): string | null {
  return e?.includes("@") ? e.split("@").pop()?.toLowerCase() ?? null : null;
}

export function strip(h: string | null | undefined): string | null {
  return h ? h.replace(/<style[\s\S]*?<\/style>/gi, " ").replace(/<script[\s\S]*?<\/script>/gi, " ").replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/\s+/g, " ").trim() || null : null;
}

function inc(v: string) {
  return v.match(/\b(CIF|FOB|CFR|DAP|DDP|EXW|FCA)\b/i)?.[1]?.toUpperCase() ?? null;
}
function pay(v: string) {
  if (/\bDLC\b/i.test(v)) return "DLC";
  if (/\bSBLC\b/i.test(v)) return "SBLC";
  if (/letter of credit|\bL\s*\/\s*C\b|\bLC\b/i.test(v)) return "LC";
  if (/\bT\s*\/\s*T\b|\bTT\b|wire transfer/i.test(v)) return "TT";
  return null;
}

export const SENSITIVE_TERMS = ["introduce us", "introduction", "buyer identity", "seller identity", "counterparty identity", "bank account",
  "banking instructions", "swift", "iban", "sign", "signature", "spa", "fee agreement", "commission", "imfpa", "ncnnda", "ncnda",
  "accept price", "accept offer", "we accept", "binding", "contract execution", "beneficiary"];

export interface Intel {
  classification: string;
  terms: Record<string, unknown>;
  missing: string[];
  sensitive: boolean;
  safe: boolean;
  score: number;
  action: string;
}

export function intel(s: string | null, b: string | null, d: string | null): Intel {
  const raw = `${s ?? ""}\n${b ?? ""}`, t = raw.toLowerCase(), has = (...a: string[]) => a.some((x) => t.includes(x));
  const supplier = has("we can supply", "we supply", "available stock", "monthly capacity", "supplier offer", "offer supply", "seller mandate");
  const buyer = has("we require", "requirement", "looking to buy", "want to buy", "purchase", "need copper", "buyer requirement", "seeking");
  const c = supplier ? "supplier" : buyer ? "buyer" : has("broker", "intermediary", "mandate") ? "broker" : d === "axeheadquarters.com" ? "internal" : "unknown";
  const q = raw.match(/(?:quantity|qty|trial|capacity)?\s*[:\-]?\s*(\d{1,6}(?:[.,]\d+)?)\s*(?:mt|metric tons?|tonnes?)/i),
    pu = raw.match(/(99(?:[.,]\d{1,4})?)\s*%/i),
    commodity = /copper cathode/i.test(raw) ? "Copper Cathode" : /copper/i.test(raw) ? "Copper" : null,
    grade = /lme\s+grade\s+a/i.test(raw) ? "LME Grade A" : /grade\s+a/i.test(raw) ? "Grade A" : null,
    dest = raw.match(/(?:destination|delivery\s+(?:to|port)|deliver\s+to)\s*[:\-]?\s*([A-Za-z][A-Za-z .'-]{1,80}?)(?=[.,;\n]|$)/i)?.[1]?.trim() ?? null;
  const terms = { commodity, grade, purity: pu ? Number(pu[1].replace(",", ".")) : null, quantity_mt: q ? Number(q[1].replace(",", ".")) : null,
    incoterm: inc(raw), destination: dest, payment_terms: pay(raw) };
  const missing: string[] = [];
  if (["buyer", "supplier"].includes(c)) {
    if (!commodity) missing.push("commodity/product confirmation");
    if (!terms.quantity_mt) missing.push("quantity / trial volume");
    if (!terms.incoterm) missing.push("Incoterm");
    if (!dest) missing.push(c === "buyer" ? "destination" : "loading point / delivery capability");
    if (!terms.payment_terms) missing.push("payment instrument/terms");
  }
  const sensitive = has(...SENSITIVE_TERMS);
  const safe = ["buyer", "supplier"].includes(c) && !sensitive;
  return { classification: c, terms, missing, sensitive, safe, score: Math.max(20, 90 - missing.length * 10),
    action: c === "supplier"
      ? "Verify legal seller entity, authority, origin/refinery/brand, executable allocation, loading point, payment, lead time and documents before any protected introduction."
      : c === "buyer" ? "Confirm legal buying entity, authority, exact requirement, destination, payment and timeline before protected matching."
      : "Review commercial context before responding." };
}

export function draftText(i: Intel, to: string | null, s: string | null): { to: string; subject: string; body: string } | null {
  if (!to || !i.safe) return null;
  let b = "Thank you for your message.\n\n";
  if (i.classification === "supplier") {
    b += "To progress this opportunity without disclosing the buyer at this stage, please confirm the legal selling entity, whether you are principal or an authorized seller, current executable allocation, origin/refinery/brand, loading point, available Incoterms, accepted payment instruments, lead time, and the documents/inspection package available for the material.";
  } else {
    b += "To progress this requirement without disclosing any supplier at this stage, please confirm the legal buying entity and authorized contact, exact product/grade and purity, trial and recurring quantity, destination port, Incoterm, accepted payment instrument, target shipment timing, and whether NorthSea Commodity Partners may coordinate the qualification process on your behalf.";
  }
  if (i.missing.length) b += `\n\nFrom your current message, the following points are still unclear: ${i.missing.join("; ")}.`;
  b += "\n\nNo counterparty introduction or binding commercial commitment is being made by this email.\n\nKind regards,\nNorthSea Commodity Partners";
  return { to, subject: s?.toLowerCase().startsWith("re:") ? s : `Re: ${s ?? "Your commodity inquiry"}`, body: b };
}

/** Zelfde corporate shell als send-approved-reply; qualification-modus. */
export function automatedHtml(t: string): string {
  return renderNorthSeaMail({ body: t, mode: "qualification" }).html;
}

export function isStratoNotification(senderDomain: string | null, subject: string | null): boolean {
  return senderDomain === "ai-voicereceptionist.com" || /nieuwe oproep/i.test(subject ?? "");
}
