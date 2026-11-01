import { describe, expect, it } from 'vitest';
import { GROK_MANAGER_IDS, grokManagers } from '@/domain/agents/grokManagers';

describe('ManagersDesk v3 roster', () => {
  it('shows the six Grok managers from the mockup', () => {
    const ids = grokManagers().map((a) => a.id);
    expect(ids).toHaveLength(6);
    expect(new Set(ids)).toEqual(new Set(GROK_MANAGER_IDS));
  });
});
