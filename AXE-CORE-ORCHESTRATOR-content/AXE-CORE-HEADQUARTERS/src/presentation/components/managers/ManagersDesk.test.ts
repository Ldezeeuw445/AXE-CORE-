import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { GROK_MANAGER_IDS, grokManagers } from '@/domain/agents/grokManagers';

describe('ManagersDesk chat room', () => {
  it('shows the six Grok managers from the mockup', () => {
    const ids = grokManagers().map((a) => a.id);
    expect(ids).toHaveLength(6);
    expect(new Set(ids)).toEqual(new Set(GROK_MANAGER_IDS));
  });

  it('is a split chat room wired to ManagerChat + real server agents', () => {
    const src = readFileSync('src/presentation/components/managers/ManagersDesk.tsx', 'utf8');
    expect(src).toContain('axe-managers-room');
    expect(src).toContain('ManagerChat');
    expect(src).toContain('useServerAgents');
    expect(src).toContain('layout="desk"');
    expect(src).toContain('/dax');
    expect(src).not.toContain('axe-managers-v3-grid');
  });
});
