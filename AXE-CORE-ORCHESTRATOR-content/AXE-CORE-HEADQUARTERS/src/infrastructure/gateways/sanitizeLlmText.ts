/**
 * Strip non-assistant metadata some providers / free models inject into
 * message content (e.g. "User Safety: safe"). Applied at the gateway so
 * every consumer (chat, agents, tools) gets clean text.
 *
 * Tool-marker lecture is the same class of leak: internal protocol, not
 * voice. stripToolInstructionLeak is the labeled belt-and-suspenders on
 * top of the conversation-first prompt rule.
 */
import { stripToolInstructionLeak } from '@/domain/tools/toolLeak';

const SAFETY_LINE =
  /^\s*(?:\(?\s*)?(?:User\s*)?Safety\s*:\s*\w+\s*(?:\)?\s*)?$/gim;
const MODERATION_LINE =
  /^\s*Moderation\s*:\s*[\w\s-]+\s*$/gim;
const LEADING_SAFETY =
  /^\s*(?:\(?\s*)?(?:User\s*)?Safety\s*:\s*\w+\s*(?:\)?\s*)[\n\r]*/i;

export function sanitizeLlmText(text: string): string {
  if (!text) return '';
  let t = text.replace(SAFETY_LINE, '').replace(MODERATION_LINE, '');
  t = t.replace(LEADING_SAFETY, '');
  t = stripToolInstructionLeak(t);
  // collapse runs of blank lines left by stripped labels
  t = t.replace(/\n{3,}/g, '\n\n').replace(/^\s+/, '').trim();
  return t;
}
