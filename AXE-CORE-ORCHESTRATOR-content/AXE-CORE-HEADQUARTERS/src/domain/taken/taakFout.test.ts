import { describe, expect, it } from 'vitest';
import { taakActieLabel, taakFoutVan } from './taakFout';

describe('taakFoutVan', () => {
  it('zet no_handler northsea om in een retry naar de crew', () => {
    const f = taakFoutVan({ code: 'no_handler', message: 'No handler for northsea_desk' });
    expect(f.actie).toBe('retry');
    expect(f.regel).toMatch(/8040/);
  });

  it('zet gpt-6-astra om in een Codex-terugval', () => {
    const f = taakFoutVan("The 'gpt-6-astra' model requires a newer version of the Codex CLI");
    expect(f.actie).toBe('retry');
    expect(f.regel).toMatch(/gpt-5-codex/);
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
});
