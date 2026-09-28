/**
 * Veiligheidshek van de axe-laag. Afgedwongen in code, niet alleen in docs.
 *
 * Drie lagen:
 * 1. Alleen-lezen tot --write/--confirm.
 * 2. Hard geblokkeerd, geen override: mail/outbound, NorthSea auto-send vlaggen,
 *    mergen naar orchestrator, data wissen.
 * 3. Acties die Luka moet zien: approval aanvragen, 'pending approval' terug.
 */

import { WRITE_PATHS } from './catalog';

export const BLOCKED_NORTHSEA_FLAGS = [
  'auto_send_qualification',
  'auto_reply_nonbinding',
  'auto_send_followups',
] as const;

const EMAIL_RE = /\b(send[-_ ]?email|email[-_ ]?send|verstuur|resend|outbound[-_ ]?message|smtp|mailgun|sendgrid)\b/i;
const DELETE_RE = /\b(delete|wissen|verwijder|drop table|truncate|rm -rf)\b/i;
const MERGE_RE = /\b(merge\s+to\s+orchestrator|merge\s+orchestrator|push\s+.*orchestrator|git\s+push\s+.*orchestrator|HEAD:orchestrator)\b/i;
const FLAG_RE = new RegExp(`\\b(${BLOCKED_NORTHSEA_FLAGS.join('|')})\\b`, 'i');

export type GuardDecision =
  | { kind: 'allow' }
  | { kind: 'need_write'; reason: string }
  | { kind: 'blocked'; reason: string; code: 'email' | 'northsea_flag' | 'merge' | 'delete' | 'unknown' }
  | { kind: 'need_approval'; reason: string };

export interface GuardInput {
  path: string;
  raw: string;
  write: boolean;
}

export function inspectBlocked(text: string): GuardDecision | null {
  const t = text.replace(/\s+/g, ' ').trim();
  if (!t) return null;
  if (FLAG_RE.test(t)) {
    return { kind: 'blocked', code: 'northsea_flag', reason: 'NorthSea auto-send flags must stay false; no override' };
  }
  if (MERGE_RE.test(t)) {
    return { kind: 'blocked', code: 'merge', reason: 'merging to orchestrator is hard-blocked' };
  }
  if (EMAIL_RE.test(t)) {
    return { kind: 'blocked', code: 'email', reason: 'sending email or outbound messages is hard-blocked' };
  }
  if (DELETE_RE.test(t) && !/\b(tasks show|tasks list|memory search)\b/i.test(t)) {
    return { kind: 'blocked', code: 'delete', reason: 'deleting data is hard-blocked' };
  }
  return null;
}

/** Schrijven buiten AXE's eigen geheugen/taken: Luka moet het zien. */
export function inspectApproval(text: string): string | null {
  const t = text.toLowerCase();
  if (/\b(git push|git commit|systemctl|docker|crontab|npm install|pip install)\b/.test(t)) {
    return 'touches the system';
  }
  if (/\b(place order|open (a )?(long|short)|mt5|broker)\b/.test(t)) {
    return 'trading execution needs approval';
  }
  if (/\bnorthsea\b/.test(t) && /\b(write|update|action|toggle|enable)\b/.test(t)) {
    return 'NorthSea write needs approval';
  }
  return null;
}

export function decideGuard(input: GuardInput): GuardDecision {
  const blocked = inspectBlocked(input.raw) ?? inspectBlocked(input.path);
  if (blocked) return blocked;

  if (WRITE_PATHS.has(input.path) && !input.write) {
    return { kind: 'need_write', reason: `${input.path} is mutating; pass --write` };
  }

  const approval = inspectApproval(input.raw);
  if (approval && input.path === 'agent run') {
    return { kind: 'need_approval', reason: approval };
  }
  return { kind: 'allow' };
}
