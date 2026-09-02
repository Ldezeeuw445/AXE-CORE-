import { describe, it, expect } from 'vitest';
import { chatCompletionsUrl } from './chatEndpoint';

describe('chatCompletionsUrl', () => {
  it('appends /v1 when the base does not have it', () => {
    // OpenRouter publishes its base this way.
    expect(chatCompletionsUrl('https://openrouter.ai/api'))
      .toBe('https://openrouter.ai/api/v1/chat/completions');
  });

  it('does not double it when the base already ends in /v1', () => {
    // Groq and Tokenra publish theirs this way. Doubling produced
    // /v1/v1/chat/completions — a 404 that reads exactly like a bad key.
    expect(chatCompletionsUrl('https://api.groq.com/openai/v1'))
      .toBe('https://api.groq.com/openai/v1/chat/completions');
    expect(chatCompletionsUrl('https://tokenra.io/v1'))
      .toBe('https://tokenra.io/v1/chat/completions');
  });

  it('tolerates a trailing slash in either form', () => {
    expect(chatCompletionsUrl('https://tokenra.io/v1/'))
      .toBe('https://tokenra.io/v1/chat/completions');
    expect(chatCompletionsUrl('https://openrouter.ai/api/'))
      .toBe('https://openrouter.ai/api/v1/chat/completions');
  });

  it('recognises other version numbers too', () => {
    expect(chatCompletionsUrl('https://example.com/v2')).toBe('https://example.com/v2/chat/completions');
  });

  it('is not fooled by a path that merely contains v1', () => {
    // /v1beta is a real Google path; it is not a versioned OpenAI base.
    expect(chatCompletionsUrl('https://example.com/v1beta'))
      .toBe('https://example.com/v1beta/v1/chat/completions');
  });

  it('never produces a doubled segment, whatever it is given', () => {
    for (const base of [
      'https://a.io', 'https://a.io/', 'https://a.io/v1', 'https://a.io/v1/',
      'https://a.io/openai/v1', 'https://a.io/api',
    ]) {
      expect(chatCompletionsUrl(base), base).not.toContain('/v1/v1/');
    }
  });
});
