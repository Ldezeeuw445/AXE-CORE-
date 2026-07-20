/**
 * core/llm/routingPolicy.ts
 *
 * Pure routing policy: classify a query into a capability class and order the
 * available provider slots accordingly. No I/O — given the same inputs it
 * always returns the same ordering, which makes this layer unit-testable.
 */

import type { KeySlot, QueryCapability } from './types';
import { sortOllamaModelsForCapability } from '@/services/ollamaModelCatalog';

/** Keyword-based fallback classifier (used when the dynamic Supabase-backed
 *  classifier is unavailable). */
export function classifyQuery(text: string): QueryCapability {
  const t = text.toLowerCase(), words = t.trim().split(/\s+/).length;
  if (/password|wachtwoord|private|prive|secret|geheim|bankrekening|bsn|credentials|adres\b|pincode/.test(t)) return 'privacy';
  if (/\bcode\b|debug|function|class|typescript|javascript|python|react|bug|syntax|implement|refactor|component|endpoint|sql|query|script/.test(t)) return 'code';
  if (/analys|research|strateg|vergelijk|compare|architect|plan\b|roadmap|design\b|explain|hoe werkt|waarom|how does|trade-off/.test(t) || words > 60) return 'analysis';
  if (/why does|what if|calculate|bereken|redeneer|pro\b|cons\b|voor- en nadelen|als .* dan/.test(t)) return 'reasoning';
  if (/schrijf|write|brainstorm|idee|creative|campaign|copywriting|beschrijf|stel je voor/.test(t)) return 'creative';
  return 'fast';
}

/** Order slots by static per-capability provider preference. */
export function selectByCapability(cap: QueryCapability, all: KeySlot[]): KeySlot[] {
  if (all.length === 0) return [];
  const bp = (ids: string[]) => all.filter(s => ids.includes(s.provider));
  const rest = (ids: string[]) => all.filter(s => !ids.includes(s.provider));
  switch (cap) {
    case 'privacy': return [...bp(['ollama']), ...rest(['ollama'])];
    case 'code': case 'analysis': case 'reasoning': return [...bp(['openrouter']), ...bp(['anthropic']), ...bp(['xai']), ...bp(['google']), ...rest(['openrouter', 'anthropic', 'xai', 'google'])];
    case 'creative': return [...bp(['openrouter', 'anthropic']), ...bp(['xai']), ...rest(['openrouter', 'anthropic', 'xai'])];
    case 'fast': default: return [...bp(['google']), ...bp(['ollama']), ...bp(['xai']), ...rest(['google', 'ollama', 'xai'])];
  }
}

/** Reorder the Ollama slots within a slot list so the best local model for
 *  the capability is tried first; non-Ollama slots keep their order. */
export function prioritizeOllamaSlots(capability: QueryCapability, slots: KeySlot[]): KeySlot[] {
  const ollama = slots.filter(s => s.provider === 'ollama');
  if (ollama.length === 0) return slots;
  const ordered = sortOllamaModelsForCapability(ollama.map(s => s.model ?? ''), capability);
  const mapped = ordered.map(name => ollama.find(s => s.model === name)).filter((s): s is KeySlot => !!s);
  return [...mapped, ...slots.filter(s => s.provider !== 'ollama')];
}

/** Map a capability to the AXE specialist agents that should handle it. */
export function capabilityToSpecialists(cap: string): string[] {
  switch (cap) {
    case 'code': return ['wags', 'forge']; case 'analysis': return ['intel', 'nova']; case 'strategy': return ['nova'];
    case 'creative': return ['nova']; case 'finance': return ['dollar_bill']; case 'trading': return ['dollar_bill'];
    case 'automation': return ['sentinel']; case 'infra': return ['forge']; case 'monitoring': return ['pulse'];
    case 'research': return ['intel']; case 'memory': return ['atlas']; case 'privacy': return ['atlas'];
    default: return ['axe_core'];
  }
}

/** Shorten a raw error message to a concise label: "401", "429", "timeout", "network", etc. */
export function shortErr(msg: string): string {
  if (/timeout|timed out|abort/i.test(msg)) return 'timeout';
  if (/network|failed to fetch|cors|load failed/i.test(msg)) return 'network';
  const m = msg.match(/\b(4\d{2}|5\d{2})\b/); if (m) return m[1];
  return msg.slice(0, 24).replace(/\s+/g, ' ').trim();
}
