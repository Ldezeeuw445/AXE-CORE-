import { describe, it, expect } from 'vitest';
import {
  isSimpleChatCapability,
  selectByCapability,
  classifyQuery,
  buildStableChatCascade,
  type KeySlot,
} from './providers';

/**
 * These lock the premise behind AXE-in-front routing: for normal conversation
 * the engine the user picked answers, and a local model (Ollama) is never
 * front-loaded except for privacy. If this regresses, "AXE" starts replying on
 * Ollama while the user is on a subscription — the exact bug we fixed.
 */
const slot = (provider: string): KeySlot =>
  ({ provider, key: 'k', model: 'm' } as unknown as KeySlot);

describe('capability boundary for AXE-in-front routing', () => {
  it('treats only fast/creative as simple chat (selected engine wins there)', () => {
    expect(isSimpleChatCapability('fast')).toBe(true);
    expect(isSimpleChatCapability('creative')).toBe(true);
    for (const specialist of ['code', 'analysis', 'reasoning', 'privacy']) {
      expect(isSimpleChatCapability(specialist)).toBe(false);
    }
  });

  it('classifies a plain greeting as fast, not a specialist task', () => {
    expect(isSimpleChatCapability(classifyQuery('hey axe, how are you?'))).toBe(true);
  });

  it('never front-loads Ollama for normal chat', () => {
    const ordered = selectByCapability('fast', [slot('ollama'), slot('google')]);
    expect(ordered[0].provider).not.toBe('ollama');
  });

  it('does front-load Ollama for privacy', () => {
    const ordered = selectByCapability('privacy', [slot('google'), slot('ollama')]);
    expect(ordered[0].provider).toBe('ollama');
  });
});

/**
 * A pinned primary is the one source of truth for who AXE is -- but a pin that
 * is out of credits (Gemini's free key was the live example) must fall THROUGH
 * to a working engine, not die on empty fallbacks with only Ollama behind it.
 * These lock that: the pin stays first, and real cloud engines sit behind it.
 */
describe('buildStableChatCascade falls through a broke pinned primary', () => {
  it('keeps the pinned primary first (still the one source of truth)', () => {
    const all = [slot('groq'), slot('cerebras'), slot('anthropic'), slot('google')];
    const cascade = buildStableChatCascade(all, { primary: slot('google') });
    expect(cascade[0].provider).toBe('google');
  });

  it('puts working cloud engines behind the pin, not just Ollama', () => {
    const all = [slot('groq'), slot('cerebras'), slot('anthropic'), slot('google'), slot('ollama')];
    const cascade = buildStableChatCascade(all, { primary: slot('google') });
    const behind = cascade.slice(1).map(s => s.provider);
    // At least one real cloud engine must back the pin (the bug left only Ollama).
    expect(behind.some(p => ['groq', 'cerebras', 'anthropic', 'openai'].includes(p))).toBe(true);
  });

  it('never repeats the pinned provider in its own fallbacks', () => {
    const all = [slot('groq'), slot('google')];
    const cascade = buildStableChatCascade(all, { primary: slot('google') });
    const googles = cascade.filter(s => s.provider === 'google');
    expect(googles).toHaveLength(1);
  });
});
