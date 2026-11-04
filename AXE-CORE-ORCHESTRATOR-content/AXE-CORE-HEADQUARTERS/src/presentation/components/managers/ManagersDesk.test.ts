import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { GROK_MANAGER_IDS, grokManagers, magPeerBericht } from '@/domain/agents/grokManagers';
import {
  BOSS_ID,
  MANAGER_APP_GROEPEN,
  PROJECTS_ORCH_ID,
  classificeerProjectsNaarManager,
  managersOnderProjects,
  managersZonderBoss,
} from '@/domain/agents/bossRoute';

describe('ManagersDesk Grok Bot layout', () => {
  it('keeps Boss separate and six app managers below', () => {
    const ids = grokManagers().map((a) => a.id);
    expect(ids).toHaveLength(6);
    expect(new Set(ids)).toEqual(new Set(GROK_MANAGER_IDS));
    expect(managersZonderBoss().map((a) => a.id)).toEqual([...GROK_MANAGER_IDS]);
    expect(BOSS_ID).toBe('axe');
    expect(PROJECTS_ORCH_ID).toBe('projectsmgr');
    expect(managersOnderProjects().map((a) => a.id)).not.toContain('projectsmgr');
    expect(managersOnderProjects()).toHaveLength(5);
  });

  it('groups managers per app like the AXE mock', () => {
    const flat = MANAGER_APP_GROEPEN.flatMap((g) => [...g.ids]);
    expect(flat).toEqual([
      'axemanager',
      'companionmgr',
      'tradingos',
      'axon',
      'northseamgr',
    ]);
    expect(flat).not.toContain('projectsmgr');
    expect(flat).not.toContain('axe');
  });

  it('is a split chat room with Boss tile + Projects orch + ManagerChat + relay', () => {
    const src = readFileSync('src/presentation/components/managers/ManagersDesk.tsx', 'utf8');
    expect(src).toContain('axe-managers-room');
    expect(src).toContain('data-axe-boss-tile');
    expect(src).toContain('ManagerChat');
    expect(src).toContain('useServerAgents');
    expect(src).toContain('layout="desk"');
    expect(src).toContain('/dax');
    expect(src).toContain('nieuwRelayMsg');
    expect(src).toContain('classificeerBossNaarManager');
    expect(src).toContain('classificeerProjectsNaarManager');
    expect(src).toContain('MANAGER_APP_GROEPEN');
    expect(src).toContain('startManagerJob');
    expect(src).not.toContain('axe-managers-v3-grid');
    expect(src).not.toMatch(/\bMgr\b/);
  });

  it('lets Projects Manager orchestrate peers', () => {
    expect(magPeerBericht('projectsmgr', 'companionmgr')).toBe(true);
    expect(classificeerProjectsNaarManager('fix companion splash')).toBe('companionmgr');
    expect(classificeerProjectsNaarManager('update projecten board')).toBe('axemanager');
  });

  it('never uses Mgr short labels in the roster managers', () => {
    for (const a of grokManagers()) {
      expect(a.kort || '').not.toMatch(/\bMgr\b/);
      expect(a.kort || '').toMatch(/Manager|Projects|AXON|Trading OS|CORE/);
    }
  });

  it('keeps Chat/Activity/Memory tabs only in Agents viewctl — not duplicated in sidebar', () => {
    const src = readFileSync('src/presentation/components/managers/ManagersDesk.tsx', 'utf8');
    expect(src).not.toContain('axe-managers-room-tabs');
    expect(src).not.toContain("['activity', 'Activity & plans']");
    expect(src).toContain('data-axe-boss-tile');
    expect(src).toContain('axe-browser-vak');
    expect(src).toContain('Boss · Orchestrator');
    // Full Grok names without Twin / kort short labels in the row
    expect(src).toContain('{a.name}');
    expect(src).not.toContain('{a.kort || a.name}');
  });

  it('ManagerChat desk header is professional — no raw JSON or DAX slogan', () => {
    const src = readFileSync('src/presentation/components/axe-core/ManagerChat.tsx', 'utf8');
    expect(src).toContain('axe-manager-pro-kop');
    expect(src).toContain('veiligeStripSamenvatting');
    expect(src).toContain('menselijkeStatusChips');
    expect(src).not.toContain('Routes to the right DAX');
    expect(src).toContain('AXE_SKILLS');
    expect(src).toContain('APPS');
    expect(src).toContain('axe-manager-picker');
    // Pickers insert human labels (skillVanTekst / boss route), not raw /id or @app_id tokens
    expect(src).toContain('s.label');
    expect(src).toContain('a.label');
    expect(src).not.toContain('/${s.id}');
    expect(src).not.toContain('@${a.id}');
    expect(src).toContain('stand?.label');
  });

});
