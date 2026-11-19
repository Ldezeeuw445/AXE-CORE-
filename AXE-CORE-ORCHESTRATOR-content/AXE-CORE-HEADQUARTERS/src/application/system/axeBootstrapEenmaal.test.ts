import { describe, expect, it } from 'vitest';
import { bootstrapAlGestart } from './axeBootstrap';

// 19 nov 2026: runAxeBootstrap liep bij elke tokenverversing opnieuw en stapelde
// zo alle achtergrondtimers op (try_autopilot_lease ~1×/s tegen de database).
describe('opstartroutine draait één keer per venster', () => {
  it('de tweede aanroep ziet dat hij al liep', () => {
    delete (globalThis as Record<string, unknown>).__axeBootstrapGestart;
    expect(bootstrapAlGestart()).toBe(false);
    expect(bootstrapAlGestart()).toBe(true);
    expect(bootstrapAlGestart()).toBe(true);
  });
});
