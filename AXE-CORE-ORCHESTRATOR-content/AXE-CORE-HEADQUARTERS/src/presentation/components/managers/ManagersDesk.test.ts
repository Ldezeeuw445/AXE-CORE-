import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { GROK_MANAGER_IDS, grokManagers } from '@/domain/agents/grokManagers';
import { BOSS_ID, managersZonderBoss } from '@/domain/agents/bossRoute';

describe('ManagersDesk chat room', () => {
  it('shows Boss separately and the six app managers below', () => {
    const ids = grokManagers().map((a) => a.id);
    expect(ids).toHaveLength(6);
    expect(new Set(ids)).toEqual(new Set(GROK_MANAGER_IDS));
    expect(managersZonderBoss().map((a) => a.id)).toEqual([...GROK_MANAGER_IDS]);
    expect(BOSS_ID).toBe('axe');
  });

  it('is a split chat room with Boss pin + ManagerChat + real server agents', () => {
    const src = readFileSync('src/presentation/components/managers/ManagersDesk.tsx', 'utf8');
    expect(src).toContain('axe-managers-room');
    expect(src).toContain('ManagerChat');
    expect(src).toContain('useServerAgents');
    expect(src).toContain('layout="desk"');
    expect(src).toContain('/dax');
    expect(src).toContain('data-axe-boss');
    expect(src).toContain('doorgestuurdTekst');
    expect(src).toContain('classificeerBossNaarManager');
    expect(src).toContain('startManagerJob');
    expect(src).not.toContain('axe-managers-v3-grid');
    expect(src).not.toMatch(/\bMgr\b/);
  });

  it('never uses Mgr short labels in the roster managers', () => {
    for (const a of grokManagers()) {
      expect(a.kort || '').not.toMatch(/\bMgr\b/);
      expect(a.kort || '').toMatch(/Manager|Projects|AXON|Trading OS|CORE/);
    }
  });
});
