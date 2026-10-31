import { describe, expect, it } from 'vitest';
import { taakActieLabel, taakFoutVan } from './taakFout';

describe('taakFoutVan', () => {
  it('zet no_handler northsea om in een retry naar de crew', () => {
    const f = taakFoutVan({ code: 'no_handler', message: 'No handler for northsea_desk' });
    expect(f.actie).toBe('retry');
    expect(f.regel).toMatch(/8040/);
  });

  it('zet gpt-6-astra om in een Codex-terugval zonder -m', () => {
    const f = taakFoutVan("The 'gpt-6-astra' model requires a newer version of the Codex CLI");
    expect(f.actie).toBe('retry');
    expect(f.regel).toMatch(/omits -m|Claude CLI/);
  });

  it('zet model_not_found van een ChatGPT-account om in dezelfde terugval', () => {
    const f = taakFoutVan("The 'gpt-5-codex' model is not supported when using Codex with a ChatGPT account. code: model_not_found");
    expect(f.actie).toBe('retry');
    expect(f.regel).toMatch(/ChatGPT account/);
    expect(f.regel).toMatch(/Claude CLI/);
  });

  it('biedt geen retry aan als GitHub de sleutel van de VPS weigert', () => {
    const f = taakFoutVan({
      code: 'handler_error',
      message: "DAX build checkout failed: fatal: could not read Username for 'https://github.com': No such device or address\n",
    }, 'DAX build: next task in AXE-CORE-');
    expect(f.actie).toBe('open');
    expect(f.regel).toMatch(/zet_github_token\.sh/);
  });

  it('stuurt login-fouten naar reconnect', () => {
    expect(taakFoutVan('OAuth session expired and could not be refreshed').actie).toBe('reconnect');
    expect(taakActieLabel('reconnect')).toBe('Reconnect account');
  });

  it('houdt een onbekende reden leesbaar', () => {
    const f = taakFoutVan({ message: 'disk full on dax-3' }, 'CI');
    expect(f.regel).toBe('disk full on dax-3');
    expect(f.actie).toBe('retry');
  });
  it('maps every-provider / rate-limit cascades to a short friendly line', () => {
    const f = taakFoutVan(
      'every provider failed — groq openai/gpt-oss-120b 429 rate limit | gemini-pro-latest: afkoelend | openai gpt-4.1-mini 429 no credits remaining',
    );
    expect(f.regel.length).toBeLessThan(160);
    expect(f.regel).not.toMatch(/gpt-oss|afkoelend|429/);
    expect(f.actie).toBe('retry');
  });

});
