import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  gekozenManagerVanSearch,
  isManagersTabPad,
  managerChatRoute,
  managersComposerDoel,
} from './managersComposerDoel';
import { BOSS_ID, PROJECTS_ORCH_ID } from './bossRoute';

const hq = join(__dirname, '../../');
const bron = (rel: string) => readFileSync(join(hq, rel), 'utf8');

describe('managersComposerDoel', () => {
  it('keeps the shell composer on Home and Trading — those talks stay with AXE Core', () => {
    expect(isManagersTabPad('/')).toBe(false);
    expect(isManagersTabPad('/trading')).toBe(false);
    expect(isManagersTabPad('/northsea')).toBe(false);
    expect(managersComposerDoel({ pathname: '/', deskActief: false })).toEqual({
      schilComposer: true,
      agentId: null,
    });
    expect(managersComposerDoel({
      pathname: '/trading',
      deskActief: true,
      gekozenId: PROJECTS_ORCH_ID,
    })).toEqual({ schilComposer: true, agentId: null });
  });

  it('hides the shell composer on Managers when a manager is selected', () => {
    const doel = managersComposerDoel({
      pathname: '/managers',
      search: '?open=projectsmgr',
      deskActief: true,
      gekozenId: PROJECTS_ORCH_ID,
    });
    expect(doel.schilComposer).toBe(false);
    expect(doel.agentId).toBe('projectsmgr');
    expect(doel.agentId).not.toBe('axe');
    expect(doel.agentId).not.toBe('wingman');
  });

  it('reads ?open= when the live desk id is missing', () => {
    expect(gekozenManagerVanSearch('?open=companionmgr')).toBe('companionmgr');
    expect(gekozenManagerVanSearch('open=tradingos')).toBe('tradingos');
    expect(gekozenManagerVanSearch('?open=wingman')).toBeNull();
    expect(managersComposerDoel({
      pathname: '/managers',
      search: '?open=axemanager',
      deskActief: true,
    }).agentId).toBe('axemanager');
  });

  it('defaults the open desk to Boss, not wingman chat', () => {
    const doel = managersComposerDoel({
      pathname: '/managers',
      deskActief: true,
    });
    expect(doel.schilComposer).toBe(false);
    expect(doel.agentId).toBe(BOSS_ID);
  });

  it('restores the AXE Core composer on Activity/Memory (desk closed)', () => {
    expect(managersComposerDoel({
      pathname: '/managers',
      search: '?open=projectsmgr',
      deskActief: false,
      gekozenId: PROJECTS_ORCH_ID,
    })).toEqual({ schilComposer: true, agentId: null });
  });

  it('treats /agents redirects as the Managers tab', () => {
    expect(isManagersTabPad('/agents')).toBe(true);
    expect(isManagersTabPad('/ai-core')).toBe(true);
    expect(isManagersTabPad('/organization')).toBe(true);
  });
});

describe('managerChatRoute', () => {
  it('pins the job to the selected manager, not AXE Core / wingman', () => {
    const route = managerChatRoute('projectsmgr', 'update the projects board');
    expect(route.agent).toBe('projectsmgr');
    expect(route.agent).not.toBe('axe');
    expect(route.agent).not.toBe('wingman');
    expect(route.tier).toBe(3);
    expect(route.kind).toBe('agent');
    expect(route.confident).toBe(true);
    expect(route.reason).toBe('managers:chat-room');
  });

  it('marks coding asks as a manager coding task on that same agent', () => {
    const route = managerChatRoute('axemanager', 'fix the bottom nav typescript');
    expect(route.agent).toBe('axemanager');
    expect(route.reason).toBe('managers:coding-task');
  });
});

describe('Managers tab wiring — shell composer vs ManagerChat', () => {
  it('AppShell hides PlaatChat while the Managers desk is open', () => {
    const shell = bron('presentation/components/layout/AppShell.tsx');
    expect(shell).toContain('useManagersDeskStore');
    expect(shell).toContain('managersDeskActief');
    expect(shell).toContain('!managersDeskActief && <PlaatChat />');
    expect(shell).not.toContain('!mobileCommandSurface && opPlaat && !volScherm && <PlaatChat />');
  });

  it('PlaatChat forwards send to the selected manager instead of voice.sendMessage', () => {
    const chat = bron('presentation/components/layout/PlaatChat.tsx');
    expect(chat).toContain('useManagersDeskStore');
    expect(chat).toContain('stuurManager');
    expect(chat).toMatch(/if \(stuurManager\) \{\s*stuurManager\(payload\);\s*return;/);
    expect(chat).toContain('await voice.sendMessage(payload)');
  });

  it('ManagersDesk publishes the live selection and ManagerChat composer target', () => {
    const desk = bron('presentation/components/managers/ManagersDesk.tsx');
    const managerChat = bron('presentation/components/axe-core/ManagerChat.tsx');
    expect(desk).toContain('useManagersDeskStore');
    expect(desk).toContain('managerChatRoute');
    expect(desk).toContain('startManagerJob');
    expect(desk).toContain('zetDesk');
    expect(desk).toContain('layout="desk"');
    expect(managerChat).toContain('data-axe-composer-target={agent.id}');
    expect(managerChat).toContain('axe-manager-composer');
  });
});
