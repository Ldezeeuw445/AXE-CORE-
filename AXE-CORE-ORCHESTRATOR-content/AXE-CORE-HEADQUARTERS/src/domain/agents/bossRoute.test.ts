import { describe, expect, it } from 'vitest';
import {
  BOSS_ID,
  bossAgent,
  classificeerBossNaarManager,
  doorgestuurdTekst,
  isBoss,
  isCodingOpdracht,
  managerCodingMeta,
  managersZonderBoss,
  primaireRepoVoor,
  berichtGestuurdLabel,
  magDoorgeven,
  classificeerProjectsNaarManager,
} from './bossRoute';
import { GROK_MANAGER_IDS } from './grokManagers';

describe('Boss vs managers', () => {
  it('Boss is AXE Core, not a manager', () => {
    expect(isBoss(BOSS_ID)).toBe(true);
    expect(isBoss('axemanager')).toBe(false);
    expect(bossAgent().id).toBe('axe');
    expect(bossAgent().name).toMatch(/AXE Core/i);
    const ids = managersZonderBoss().map((a) => a.id);
    expect(ids).toEqual([...GROK_MANAGER_IDS]);
    expect(ids).not.toContain('axe');
  });

  it('classificeert Boss-berichten naar de juiste manager', () => {
    expect(classificeerBossNaarManager('fix the companion login')).toBe('companionmgr');
    expect(classificeerBossNaarManager('axon memory cap check')).toBe('axon');
    expect(classificeerBossNaarManager('trading-os chart bug')).toBe('tradingos');
    expect(classificeerBossNaarManager('northsea deal follow-up')).toBe('northseamgr');
    expect(classificeerBossNaarManager('update projecten board')).toBe('projectsmgr');
    expect(classificeerBossNaarManager('bottom nav Managers tab')).toBe('axemanager');
    expect(classificeerBossNaarManager('random hello')).toBe('axemanager');
  });

  it('toont doorgestuurd naar <Manager>', () => {
    expect(doorgestuurdTekst('companionmgr')).toBe('doorgestuurd naar AXE Companion Manager');
    expect(doorgestuurdTekst('axemanager')).toBe('doorgestuurd naar AXE CORE Manager');
  });

  it('coding meta is PR-only, never merge/deploy', () => {
    expect(isCodingOpdracht('fix the tauri nav bug')).toBe(true);
    expect(isCodingOpdracht('hoe laat is het')).toBe(false);
    const meta = managerCodingMeta('companionmgr', 'fix companion splash');
    expect(meta).toMatchObject({
      produce_pr_only: true,
      no_auto_merge: true,
      no_deploy: true,
      manager_coding: true,
      manager: 'companionmgr',
      repo: primaireRepoVoor('companionmgr'),
    });
    expect(primaireRepoVoor('axon')).toBe('axon-memory');
    expect(primaireRepoVoor('tradingos')).toBe('trading-os-app');
  });
});

describe('Projects orchestrator + relay label', () => {
  it('magDoorgeven for Boss and Projects only', () => {
    expect(magDoorgeven('axe')).toBe(true);
    expect(magDoorgeven('projectsmgr')).toBe(true);
    expect(magDoorgeven('companionmgr')).toBe(false);
  });

  it('Projects never routes to itself', () => {
    expect(classificeerProjectsNaarManager('update projecten board')).toBe('axemanager');
  });

  it('relay label uses agent display name', () => {
    expect(berichtGestuurdLabel('projectsmgr')).toBe('Projects Manager');
    expect(berichtGestuurdLabel('axe')).toBe('AXE Core');
  });
});
