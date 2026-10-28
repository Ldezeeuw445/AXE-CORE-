import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { AXE_AGENTS } from './roster';
import {
  AUTO_SEND_VLAGGEN, GROK_MANAGER_IDS, GROK_PULSE, GROK_REPO_SCOPE,
  grokManagers, isGrokManager, isHumanPrincipal, magPeerBericht, toetsManagerActie,
} from './grokManagers';

describe('Grok Bot-managers', () => {
  it('zijn zes nieuwe rijen, naast de bestaande, met eigen pulse en repo', () => {
    expect(GROK_MANAGER_IDS).toHaveLength(6);
    expect(grokManagers().map((a) => a.id)).toEqual([...GROK_MANAGER_IDS]);
    expect(grokManagers().every((a) => a.tier === 'managers')).toBe(true);
    for (const id of GROK_MANAGER_IDS) {
      expect(isGrokManager(id)).toBe(true);
      expect(GROK_PULSE[id]).toMatch(/^\*\/\d+ \* \* \* \*$/);
      expect(GROK_REPO_SCOPE[id].repos.length).toBeGreaterThan(0);
    }
    expect(AXE_AGENTS.some((a) => a.id === 'northsea')).toBe(true);
    expect(AXE_AGENTS.some((a) => a.id === 'northseamgr')).toBe(true);
    expect(AXE_AGENTS.find((a) => a.id === 'northsea')?.name).not.toBe(
      AXE_AGENTS.find((a) => a.id === 'northseamgr')?.name,
    );
  });

  it('AXE CORE Manager mag iedereen aanschrijven; de rest alleen terug', () => {
    expect(magPeerBericht('axemanager', 'projectsmgr')).toBe(true);
    expect(magPeerBericht('axemanager', 'northseamgr')).toBe(true);
    expect(magPeerBericht('projectsmgr', 'axemanager')).toBe(true);
    expect(magPeerBericht('projectsmgr', 'axon')).toBe(false);
    expect(magPeerBericht('wingman', 'axemanager')).toBe(false);
    expect(magPeerBericht('axemanager', 'axemanager')).toBe(false);
  });

  it('een manager is nooit is_human; Luka wel', () => {
    expect(isHumanPrincipal('luka')).toBe(true);
    expect(isHumanPrincipal('axemanager')).toBe(false);
    expect(isHumanPrincipal('northseamgr')).toBe(false);
    expect(isHumanPrincipal('northsea-desk-manager')).toBe(false);
    expect(isHumanPrincipal('luka', 'axe-core-northsea-desk')).toBe(false);
    expect(isHumanPrincipal('')).toBe(false);
  });

  it('blokkeert auto_send, live orders, geld, deals en out-of-plan sends', () => {
    for (const flag of AUTO_SEND_VLAGGEN) {
      expect(toetsManagerActie({ soort: 'config', tekst: `set ${flag}=true` }).ok).toBe(false);
    }
    expect(toetsManagerActie({ soort: 'live_order', tekst: 'place_order XAUUSD' }).ok).toBe(false);
    expect(toetsManagerActie({ soort: 'money', tekst: 'wire_transfer 400' }).ok).toBe(false);
    expect(toetsManagerActie({ soort: 'deal_move', tekst: 'close the deal' }).ok).toBe(false);
    expect(toetsManagerActie({
      soort: 'send', tekst: 'send_email to buyer', principal: 'northseamgr',
    })).toMatchObject({ ok: false, code: 'not_human' });
    expect(toetsManagerActie({
      soort: 'send', tekst: 'send_email chase',
      principal: 'luka', bestaandeThread: true, lukaJa: true,
    }).ok).toBe(true);
    expect(toetsManagerActie({ soort: 'pulse', tekst: 'queue 3 open, nothing sent' }).ok).toBe(true);
  });

  it('Companion, AXON en Trading OS hebben hun echte repo/supabase', () => {
    expect(GROK_REPO_SCOPE.companionmgr.repos).toContain('AXE-COMPANION-OS-');
    expect(GROK_REPO_SCOPE.axon).toMatchObject({ repos: ['axon-memory'], supabase: 'ktaditgtbubonrahyiig' });
    expect(GROK_REPO_SCOPE.tradingos.repos).toEqual(
      expect.arrayContaining(['trading-os-app', 'axe-trading-core']),
    );
    expect(GROK_REPO_SCOPE.tradingos.tools).not.toContain('write_file');
    expect(GROK_REPO_SCOPE.northseamgr.tools).not.toContain('write_file');
  });

  it('de Agents-tab toont een MANAGERS-blok en een approvals-wachtrij, zonder de War Room te kopiëren', () => {
    const rooster = readFileSync(join(__dirname, '../../presentation/components/agents/TierRooster.tsx'), 'utf8');
    expect(rooster).toMatch(/titel="MANAGERS"/);
    expect(rooster).toMatch(/titel="Approvals for Luka"/);
    expect(rooster).toMatch(/titel="Wingman's crew"/);
    expect(rooster).toMatch(/grokManagerLeden/);
    expect(rooster).toMatch(/GoedkeuringActie/);
    const pagina = readFileSync(join(__dirname, '../../presentation/pages/Agents.tsx'), 'utf8');
    expect(pagina).toMatch(/goedkeuringen=\{goedkeuringen\}/);
    expect(pagina).toMatch(/listPendingApprovals/);
  });
});
