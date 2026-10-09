import { describe, it, expect } from 'vitest';
import { REALTIME_VOICE_RULES, AXE_SYSTEM_PROMPT, PARTNER_CHARTER } from '@/domain/prompts';
import { isSchrijvendeMcpTool, registerStemTools, isRegisterTool } from './realtimePartnerTools';

// Luka, 9 okt: "alles wat ik vraag of wil weten moet AXE ook kunnen doen, en kunnen vertellen".
// De stem had tien dingen terwijl de getypte chat het hele register had; dit houdt de twee gelijk.
describe('de stem heeft het hele register', () => {
  it('geeft de registertools als stemtools, zonder de twee die een eigen stemtool hebben', () => {
    const namen = registerStemTools().map(t => t.name);
    for (const eigen of ['computer_read', 'computer_run', 'agent', 'crew']) expect(namen).not.toContain(eigen);
    expect(isRegisterTool('computer_run')).toBe(false);
    expect(isRegisterTool('search')).toBe(true);
    expect(isRegisterTool('bestaat_niet')).toBe(false);
  });

  it('elke stemtool heeft een naam, uitleg en een schema', () => {
    for (const t of registerStemTools()) {
      expect(t.name).toMatch(/^[a-z_]+$/);
      expect(t.description.length).toBeGreaterThan(4);
      expect(t.parameters).toBeTruthy();
    }
  });

  it('een verbonden dienst: lezen loopt direct, veranderen of versturen vraagt eerst een kaart', () => {
    for (const lezen of ['list_projects', 'get_issue', 'search_docs', 'query_logs', 'read_file']) {
      expect(isSchrijvendeMcpTool(lezen), lezen).toBe(false);
    }
    for (const schrijven of ['create_branch', 'send-email', 'delete_project', 'apply_migration', 'merge_branch', 'update_contact', 'deploy_edge_function']) {
      expect(isSchrijvendeMcpTool(schrijven), schrijven).toBe(true);
    }
  });
});

describe('de opdracht is geen gesloten loket meer', () => {
  it('de stem kent de partnerregels en zijn nieuwe tools, en telt zijn tools niet meer op "zeven"', () => {
    expect(REALTIME_VOICE_RULES).toContain(PARTNER_CHARTER);
    expect(REALTIME_VOICE_RULES).toMatch(/get_overview/);
    expect(REALTIME_VOICE_RULES).toMatch(/use_connected_service/);
    expect(REALTIME_VOICE_RULES).not.toMatch(/exactly seven/i);
  });

  it('de getypte chat zegt niet meer "standaard dicht"; wel eerlijk, en met een route verder', () => {
    expect(AXE_SYSTEM_PROMPT).toContain(PARTNER_CHARTER);
    expect(AXE_SYSTEM_PROMPT).not.toMatch(/default is closed/i);
    expect(AXE_SYSTEM_PROMPT).toMatch(/never produce fake command output/i);
    expect(PARTNER_CHARTER).toMatch(/never hide a failure/i);
    expect(PARTNER_CHARTER).toMatch(/approval card/i);
  });
});
