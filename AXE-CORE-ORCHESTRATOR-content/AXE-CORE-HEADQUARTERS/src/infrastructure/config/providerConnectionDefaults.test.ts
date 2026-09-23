import { describe, it, expect } from 'vitest';
import { normalizeProviderBaseUrl, getDefaultProviderBaseUrl } from './providerConnectionDefaults';

describe('hermes shares Ollama\'s URL, not a dead one of its own', () => {
  // Hermes is an Ollama model (hermes3:8b), not its own service (see
  // providers.ts). A stray VITE_HERMES_URL default that never existed left
  // this resolving to '', which normalizeProviderBaseUrl then turned into the
  // unreachable '/proxy/hermes' -- the literal cause of the "Request URL is
  // missing an 'http://' or 'https://' protocol" test failure.
  it('has a non-empty default base URL', () => {
    const url = getDefaultProviderBaseUrl('hermes');
    expect(url).toBeTruthy();
  });

  it('normalizes to a real URL with no stored connection', () => {
    const url = normalizeProviderBaseUrl('hermes', undefined);
    expect(url).toBeTruthy();
    expect(url).not.toBe('/proxy/hermes');
  });

  it('matches ollama\'s own resolved default', () => {
    expect(normalizeProviderBaseUrl('hermes', undefined))
      .toBe(normalizeProviderBaseUrl('ollama', undefined));
  });
});
