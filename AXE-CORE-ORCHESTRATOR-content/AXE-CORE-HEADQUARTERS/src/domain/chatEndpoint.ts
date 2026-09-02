/**
 * The OpenAI-format chat endpoint for a base URL, whichever form it is written in.
 *
 * ## Why this is not a one-liner
 *
 * Providers publish their base URL inconsistently. Groq documents
 * `https://api.groq.com/openai/v1`, OpenRouter documents
 * `https://openrouter.ai/api`, Tokenra documents `https://tokenra.io/v1`. Both
 * forms are correct as published, and appending `/v1/chat/completions` to the
 * first kind produces `/v1/v1/chat/completions`.
 *
 * That was handled by special-casing one provider by name. It works for the
 * provider that was noticed and for nobody else — and the Settings screen lets
 * anyone add a provider with either form, where the failure is a 404 that reads
 * exactly like a rejected API key. This module's sibling comment in llmGateway
 * says the same thing about Anthropic's base: accept either form rather than
 * demanding one.
 *
 * So: append `/v1` only when it is not already there.
 */

/** Trailing slashes, so `https://x.io/v1/` is recognised as ending in /v1. */
function trimEnd(url: string): string {
  return url.replace(/\/+$/, '');
}

export function chatCompletionsUrl(baseUrl: string): string {
  const base = trimEnd(baseUrl);
  return /\/v\d+$/.test(base)
    ? `${base}/chat/completions`
    : `${base}/v1/chat/completions`;
}
