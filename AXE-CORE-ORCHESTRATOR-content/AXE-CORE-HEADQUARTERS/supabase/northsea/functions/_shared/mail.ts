/**
 * NorthSea corporate correspondence — één renderer, één identiteit.
 *
 * Edge-function kopie van src/domain/northsea/mail.ts. Inhoudelijk gelijk houden.
 * send-approved-reply en resend-inbound zijn de enige Resend-verzendpaden.
 */

export const NORTHSEA_IDENTITY = {
  name: 'Luka de Zeeuw',
  title: 'Managing Director',
  company: 'NorthSea Commodity Partners',
  email: 'trade@northseacommodity.com',
  phone: '+31 20 399 2421',
  web: 'northseacommodity.com',
} as const;

/** Alleen feiten die al in de bestaande huisstijl/configuratie staan. Geen KvK, geen adres. */
export const LEGAL_FOOTER = [
  'NorthSea Commodity Partners is operated by AXE Headquarters in the Netherlands.',
  'NorthSea Commodity Partners acts as an independent commercial intermediary. Any transaction remains subject to counterparty qualification, verification and definitive contractual agreement.',
] as const;

export type MailMode =
  | 'qualification'
  | 'follow_up'
  | 'commercial_alignment'
  | 'document_request'
  | 'approval_introduction'
  | 'general';

export const MAIL_MODE_LABEL: Record<MailMode, string> = {
  qualification: 'Qualification',
  follow_up: 'Follow-up',
  commercial_alignment: 'Commercial Alignment',
  document_request: 'Document Request',
  approval_introduction: 'Approval / Introduction',
  general: 'Correspondence',
};

export interface MailReference {
  deal?: string | null;
  commodity?: string | null;
  quantity?: string | null;
  destination?: string | null;
  incoterm?: string | null;
}

export interface SplitBody {
  newContent: string;
  signature: string | null;
  quotedHistory: string | null;
}

export interface RenderedMail {
  html: string;
  text: string;
  parts: SplitBody;
  mode: MailMode;
}

const SIGN_OFF = /^(kind regards|best regards|yours sincerely|met vriendelijke groet|regards),?\s*$/i;
const ON_WROTE = /^on .+wrote:\s*$/i;
const ORIGINAL = /^-{2,}\s*original message\s*-{2,}\s*$/i;
const BEGIN_FW = /^-{2,}\s*forwarded message\s*-{2,}\s*$/i;

export function inferMailMode(purposeOrSubject?: string | null): MailMode {
  const t = (purposeOrSubject || '').toLowerCase();
  if (/introduc|approval.?intro|identity disclos/.test(t)) return 'approval_introduction';
  if (/document|documentation|coa|inspection/.test(t)) return 'document_request';
  if (/follow[- ]?up|reminder|following up/.test(t)) return 'follow_up';
  if (/align|commercial terms|incoterm|payment/.test(t) && /align|terms/.test(t)) return 'commercial_alignment';
  if (/qualif/.test(t)) return 'qualification';
  return 'general';
}

export function knownReference(ref?: MailReference | null): Array<{ label: string; value: string }> {
  if (!ref) return [];
  const rows: Array<{ label: string; value: string }> = [];
  const add = (label: string, value?: string | null) => {
    const v = (value ?? '').trim();
    if (v) rows.push({ label, value: v });
  };
  add('Reference', ref.deal);
  add('Commodity', ref.commodity);
  add('Quantity', ref.quantity);
  add('Destination', ref.destination);
  add('Incoterm', ref.incoterm);
  return rows;
}

export function looksLikeHtml(text: string): boolean {
  const t = (text || '').trim();
  if (t.length < 12) return false;
  return /<(?:html|body|div|p|br|table|blockquote)\b/i.test(t);
}

export function esc(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** RFC-citatieprefixen van een geciteerde blok halen, zonder de inhoud te herschrijven. */
export function stripQuotePrefixes(quoted: string): string {
  return quoted
    .split('\n')
    .map(line => line.replace(/^\s*>+\s?/, ''))
    .join('\n')
    .replace(/^\s*\n/, '');
}

function isQuotedLine(line: string): boolean {
  return /^\s*>/.test(line);
}

function findQuotedHistoryStart(lines: string[]): number | null {
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (ON_WROTE.test(line) || ORIGINAL.test(line) || BEGIN_FW.test(line)) return i;
    if (/^from:\s+\S/i.test(line) && i + 1 < lines.length && /^(sent|date|subject):/i.test(lines[i + 1].trim())) {
      return i;
    }
  }
  let firstQuoted: number | null = null;
  let quoted = 0;
  for (let i = 0; i < lines.length; i++) {
    if (isQuotedLine(lines[i])) {
      if (firstQuoted == null) firstQuoted = i;
      quoted += 1;
    }
  }
  if (firstQuoted == null) return null;
  const tail = lines.length - firstQuoted;
  if (tail >= 2 && quoted / tail >= 0.5) {
    // Citaat begint na een lege regel, of het hele bericht is een reply-citaat.
    if (firstQuoted === 0) return 0;
    if (lines[firstQuoted - 1].trim() === '') return firstQuoted;
    if (quoted >= 3) return firstQuoted;
  }
  return null;
}

function splitSignature(head: string): { body: string; signature: string | null } {
  const lines = head.split('\n');
  if (lines.length < 2) return { body: head.trimEnd(), signature: null };
  const windowStart = Math.max(0, lines.length - 14);
  let at: number | null = null;
  for (let i = lines.length - 1; i >= windowStart; i--) {
    const t = lines[i].trim();
    if (SIGN_OFF.test(t) || t === NORTHSEA_IDENTITY.name) at = i;
  }
  if (at == null) return { body: head.replace(/\s+$/, ''), signature: null };
  const signature = lines.slice(at).join('\n').trim();
  const body = lines.slice(0, at).join('\n').replace(/\s+$/, '');
  if (!signature) return { body: head.replace(/\s+$/, ''), signature: null };
  const looksOfficial = /northsea|luka de zeeuw|kind regards|best regards/i.test(signature);
  if (!looksOfficial || signature.split('\n').length > 10) {
    return { body: head.replace(/\s+$/, ''), signature: null };
  }
  return { body, signature };
}

export function splitEmailBody(raw: string): SplitBody {
  const text = (raw || '').replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  if (!text.trim()) return { newContent: '', signature: null, quotedHistory: null };
  const lines = text.split('\n');
  const quoteAt = findQuotedHistoryStart(lines);
  let quotedHistory: string | null = null;
  let head = text;
  if (quoteAt != null) {
    quotedHistory = lines.slice(quoteAt).join('\n').replace(/^\s+|\s+$/g, '') || null;
    head = lines.slice(0, quoteAt).join('\n').replace(/\s+$/, '');
  }
  const { body, signature } = splitSignature(head);
  return { newContent: body, signature, quotedHistory };
}

/**
 * Beperkte HTML-sanitisatie voor weergave in AXE Core.
 * Geen scripts, geen event-handlers, alleen http(s)/mailto-links.
 */
export function sanitizeEmailHtml(html: string): string {
  let s = html.replace(/<script[\s\S]*?<\/script>/gi, '').replace(/<style[\s\S]*?<\/style>/gi, '');
  s = s.replace(/\son[a-z]+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, '');
  s = s.replace(/<(?!\/?(?:p|br|blockquote|strong|b|em|i|a|span|div|table|thead|tbody|tr|td|th|ul|ol|li)\b)[^>]*>/gi, '');
  s = s.replace(/<a\b([^>]*)>/gi, (_m, attrs: string) => {
    const href = /\bhref\s*=\s*("([^"]*)"|'([^']*)'|([^\s>]+))/i.exec(attrs);
    const raw = (href?.[2] ?? href?.[3] ?? href?.[4] ?? '').trim();
    if (/^(https?:|mailto:)/i.test(raw)) return `<a href="${esc(raw)}">`;
    return '<a>';
  });
  return s;
}

function parasHtml(text: string): string {
  const blocks = text.split(/\n\s*\n/).map(b => b.trim()).filter(Boolean);
  if (blocks.length === 0) return '';
  return blocks
    .map(p => `<p style="margin:0 0 16px 0;font-family:Georgia,'Times New Roman',Times,serif;font-size:15px;line-height:24px;color:#1a1f24;">${esc(p).replace(/\n/g, '<br>')}</p>`)
    .join('');
}

function quotedHtml(quoted: string): string {
  const inner = esc(stripQuotePrefixes(quoted)).replace(/\n/g, '<br>');
  return `<blockquote style="margin:8px 0 0 0;padding:10px 0 10px 14px;border-left:2px solid #b08a5a;font-family:Georgia,'Times New Roman',Times,serif;font-size:13px;line-height:21px;color:#5c656e;">${inner}</blockquote>`;
}

function referenceHtml(ref?: MailReference | null): string {
  const rows = knownReference(ref);
  if (rows.length === 0) return '';
  const cells = rows
    .map(r => `<tr><td style="padding:2px 14px 2px 0;font-family:Arial,Helvetica,sans-serif;font-size:11px;letter-spacing:0.06em;text-transform:uppercase;color:#8a6a45;white-space:nowrap;">${esc(r.label)}</td><td style="padding:2px 0;font-family:Arial,Helvetica,sans-serif;font-size:12px;color:#1a1f24;">${esc(r.value)}</td></tr>`)
    .join('');
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 22px 0;border-collapse:collapse;">${cells}</table>`;
}

function signatureHtml(): string {
  const id = NORTHSEA_IDENTITY;
  return `<span style="font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:21px;color:#1a1f24;font-weight:bold;">${esc(id.name)}</span><br>`
    + `<span style="font-family:Arial,Helvetica,sans-serif;font-size:13px;line-height:20px;color:#4a5560;">${esc(id.title)}</span><br>`
    + `<span style="font-family:Arial,Helvetica,sans-serif;font-size:13px;line-height:20px;color:#1a1f24;font-weight:bold;">${esc(id.company)}</span><br><br>`
    + `<a href="mailto:${esc(id.email)}" style="font-family:Arial,Helvetica,sans-serif;font-size:13px;line-height:20px;color:#8b5b2c;text-decoration:none;">${esc(id.email)}</a><br>`
    + `<a href="tel:+31203992421" style="font-family:Arial,Helvetica,sans-serif;font-size:13px;line-height:20px;color:#8b5b2c;text-decoration:none;">${esc(id.phone)}</a><br>`
    + `<a href="https://${esc(id.web)}" style="font-family:Arial,Helvetica,sans-serif;font-size:13px;line-height:20px;color:#8b5b2c;text-decoration:none;">${esc(id.web)}</a>`;
}

function signatureText(): string {
  const id = NORTHSEA_IDENTITY;
  return `${id.name}\n${id.title}\n${id.company}\n${id.email}\n${id.phone}\n${id.web}`;
}

export function renderNorthSeaMail(input: {
  body: string;
  mode?: MailMode;
  reference?: MailReference | null;
  personalSignature?: boolean;
}): RenderedMail {
  const mode = input.mode ?? 'general';
  const parts = splitEmailBody(input.body || '');
  const personal = input.personalSignature !== false;
  const modeLabel = MAIL_MODE_LABEL[mode];
  const refBlock = referenceHtml(input.reference);
  const quoteBlock = parts.quotedHistory
    ? `<p style="margin:22px 0 6px 0;font-family:Arial,Helvetica,sans-serif;font-size:10px;letter-spacing:0.12em;text-transform:uppercase;color:#8a9197;">Previous correspondence</p>${quotedHtml(parts.quotedHistory)}`
    : '';
  const html = `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><meta http-equiv="X-UA-Compatible" content="IE=edge"><title>${esc(NORTHSEA_IDENTITY.company)}</title></head>`
    + `<body style="margin:0;padding:0;background-color:#f2f1ee;">`
    + `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;background-color:#f2f1ee;">`
    + `<tr><td align="center" style="padding:24px 12px;">`
    + `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:620px;background-color:#ffffff;border-collapse:collapse;">`
    + `<tr><td bgcolor="#0c1218" style="background-color:#0c1218;padding:22px 32px 20px 32px;">`
    + `<span style="font-family:Arial,Helvetica,sans-serif;font-size:17px;line-height:22px;color:#f4efe6;font-weight:bold;letter-spacing:1.8px;">NORTHSEA</span><br>`
    + `<span style="font-family:Arial,Helvetica,sans-serif;font-size:10px;line-height:16px;color:#c4b49a;letter-spacing:2.4px;">COMMODITY PARTNERS</span>`
    + `</td></tr>`
    + `<tr><td bgcolor="#a56f3a" style="height:3px;line-height:3px;font-size:0;background-color:#a56f3a;">&nbsp;</td></tr>`
    + `<tr><td style="padding:28px 32px 8px 32px;">`
    + `<p style="margin:0 0 18px 0;font-family:Arial,Helvetica,sans-serif;font-size:10px;letter-spacing:0.16em;text-transform:uppercase;color:#8a6a45;">${esc(modeLabel)}</p>`
    + refBlock
    + parasHtml(parts.newContent)
    + `</td></tr>`
    + (personal
      ? `<tr><td style="padding:4px 32px 28px 32px;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-top:1px solid #e4ddd3;"><tr><td style="padding-top:18px;">${signatureHtml()}</td></tr></table></td></tr>`
      : '')
    + (quoteBlock ? `<tr><td style="padding:0 32px 24px 32px;">${quoteBlock}</td></tr>` : '')
    + `<tr><td bgcolor="#f7f5f1" style="background-color:#f7f5f1;padding:14px 32px 16px 32px;border-top:1px solid #ece7df;">`
    + `<span style="font-family:Arial,Helvetica,sans-serif;font-size:10px;line-height:15px;color:#737c84;">${esc(LEGAL_FOOTER[0])}</span><br><br>`
    + `<span style="font-family:Arial,Helvetica,sans-serif;font-size:10px;line-height:15px;color:#8a9197;">${esc(LEGAL_FOOTER[1])}</span>`
    + `</td></tr></table></td></tr></table></body></html>`;

  const textBits: string[] = [];
  if (parts.newContent.trim()) textBits.push(parts.newContent.trim());
  if (personal) textBits.push(signatureText());
  if (parts.quotedHistory) {
    textBits.push('--- Previous correspondence ---\n' + parts.quotedHistory);
  }
  textBits.push(LEGAL_FOOTER.join('\n\n'));
  const text = textBits.join('\n\n');
  return { html, text, parts, mode };
}

/** Compat: bestaande send-approved-reply-aanroep. */
export function brandedHtml(text: string): string {
  return renderNorthSeaMail({ body: text, mode: 'general' }).html;
}

export function brandedText(text: string): string {
  return renderNorthSeaMail({ body: text, mode: 'general' }).text;
}

/** Nieuwe inhoud mag geen handmatig geplaatste `>`-prefixen bevatten. */
export function newContentHasQuotePrefixes(newContent: string): boolean {
  return newContent.split('\n').some(line => /^\s*>/.test(line) && line.trim() !== '>');
}
