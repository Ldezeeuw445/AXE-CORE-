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

  it('houdt de eerste lintregel leesbaar voor Home', () => {
    const regel = "src/presentation/store/voiceStore.ts:12:5  error  @typescript-eslint/no-unused-vars  'foo' is defined but never used.";
    const f = taakFoutVan({
      message: `Project check failed: lint (1 new)\n${regel}`,
      findings: [regel],
    }, 'Build next step: AXE Core');
    expect(f.regel).toMatch(/voiceStore\.ts:12/);
    expect(f.regel).toMatch(/no-unused-vars/);
    expect(f.actie).toBe('fix');
  });
  it('maps every-provider / rate-limit cascades to a short friendly line', () => {
    const f = taakFoutVan(
      'every provider failed — groq openai/gpt-oss-120b 429 rate limit | gemini-pro-latest: afkoelend | openai gpt-4.1-mini 429 no credits remaining',
    );
    expect(f.regel.length).toBeLessThan(160);
    expect(f.regel).not.toMatch(/gpt-oss|afkoelend|429/);
    expect(f.actie).toBe('retry');
  });

  it('maps project-check lint failures to Fix, not Retry', () => {
    const f = taakFoutVan(
      { message: 'Project check failed: lint' },
      'Build next step: AXE Companion',
    );
    expect(f.actie).toBe('fix');
    expect(taakActieLabel('fix')).toBe('Fix');
    expect(f.regel).toMatch(/Lint failed/i);
    expect(f.regel).toMatch(/Fix starts a repair task/i);
    expect(f.regel).toMatch(/Retry only re-checks/i);
  });

  it('toont bestand en regel uit verification checks, niet alleen de one-liner', () => {
    const f = taakFoutVan(
      { message: 'Project check failed: lint' },
      'Build next step: AXE Companion',
      {
        metadata: {
          bewijs: {
            verification: {
              passed: false,
              reason: 'Project check failed: lint',
              checks: [{
                name: 'lint',
                passed: false,
                detail: [
                  '/Users/luka/AXE-COMPANION-OS-/src/app/index.tsx',
                  "  12:3  error  'unused' is defined but never used  @typescript-eslint/no-unused-vars",
                  '',
                  '✖ 1 problem (1 error, 0 warnings)',
                ].join('\n'),
              }],
            },
          },
        },
      },
    );
    expect(f.actie).toBe('fix');
    expect(f.regel).toMatch(/index\.tsx:12/);
    expect(f.regel).toMatch(/@typescript-eslint\/no-unused-vars/);
    expect(f.regel).toMatch(/Fix starts a repair task/i);
  });

  it('leest lintregels uit result, events en steps als die er zijn', () => {
    const f = taakFoutVan(
      { message: 'Project check failed: typecheck' },
      'Build next step: AXE Core',
      {
        result: {
          bewijs: {
            verification: {
              checks: [{
                name: 'typecheck',
                passed: false,
                detail: 'src/foo.ts(4,1): error TS6133: unused is declared but never used.',
              }],
            },
          },
        },
        events: [{ message: 'src/bar.ts:8:1 error Unexpected var  no-var' }],
        steps: [{ error: { output: 'src/baz.tsx:2:1 error React Hook useEffect has a missing dependency  react-hooks/exhaustive-deps' } }],
      },
    );
    expect(f.actie).toBe('fix');
    expect(f.regel).toMatch(/foo\.ts:4|TS6133|bar\.ts:8|no-var|baz\.tsx:2|exhaustive-deps/);
  });

});
