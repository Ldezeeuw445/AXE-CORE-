import { describe, it, expect } from 'vitest';
import { classifyAxeTier } from '@/domain/tierRouter/axeRoute';
import { jobAgentVan } from '@/domain/tierRouter/axeJobRegels';
import { kluisPadVoorTaak } from './kluisBoom';
import { repoIdVanTekst, werkplekVanTekst } from './werkplek';

describe('werkplekVanTekst', () => {
  it('doe dit aan Northsea Desk — zonder agent-id, zonder mapnaam', () => {
    const tekst = 'doe dit aan Northsea Desk';
    const plek = werkplekVanTekst(tekst);
    expect(plek.opdracht).toBe(true);
    expect(plek.agent).toBe('northsea');
    expect(plek.tab).toBe('Northsea Desk');
    expect(classifyAxeTier(tekst).agent).toBe('northsea');
    expect(jobAgentVan(classifyAxeTier(tekst), tekst)).toBe('northsea');
    expect(kluisPadVoorTaak('task-1', 'northsea')).toBe(
      'AXE/Agents/NorthSea Desk Manager/Tasks/task-1/task.md',
    );
  });

  it('commodity desk is genoeg — hij noemt de agent niet', () => {
    const tekst = 'doe dit aan de commodity desk';
    expect(tekst.toLowerCase()).not.toContain('northsea');
    expect(werkplekVanTekst(tekst).agent).toBe('northsea');
    expect(classifyAxeTier(tekst).agent).toBe('northsea');
  });

  it('legt een repo vast als de zin er een noemt', () => {
    expect(repoIdVanTekst('fix the login bug in axe core')).toBe('axe-core');
    expect(werkplekVanTekst('fix the login bug in axe core').repo).toBe('axe-core');
  });
});
