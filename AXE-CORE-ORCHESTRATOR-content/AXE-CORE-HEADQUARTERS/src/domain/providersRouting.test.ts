import { describe, it, expect } from 'vitest';
import {
  isSimpleChatCapability,
  selectByCapability,
  classifyQuery,
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
