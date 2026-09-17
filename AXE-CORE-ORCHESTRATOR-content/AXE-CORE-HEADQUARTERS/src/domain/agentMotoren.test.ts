import { describe, it, expect } from 'vitest';
import {
  normaliseer, kiesbaar, wijsToe, abonnementVan, cascadeVoorAgent,
  STANDAARD_TOEWIJZING, TOEGESTAAN, HOOFD_AGENTS,
} from '@/domain/agentMotoren';

describe('vijf tier-1 managers, zes abonnementen', () => {
  it('begint met elk abonnement bij hooguit één agent', () => {
    const t = normaliseer(null);
    expect(t).toEqual(STANDAARD_TOEWIJZING);
    const abonnementen = HOOFD_AGENTS.map(a => t[a]).filter(m => m !== 'sleutels');
    expect(new Set(abonnementen).size).toBe(abonnementen.length);
  });

  it('laat een abonnement nooit bij twee agents staan, ook niet uit een oude opgeslagen waarde', () => {
    const t = normaliseer({ wingman: 'codex', trading: 'codex', developer: 'codex' });
    expect(t.wingman).toBe('codex');       // eerst in HOOFD_AGENTS-volgorde, wint
    expect(t.developer).toBe('cursor');    // valt terug op zijn standaard, die vrij is
    expect(t.trading).toBe('sleutels');    // zijn standaard (codex) is bezet
  });

  it('elke agent mag elk abonnement, ook Cursor, en de NorthSea Desk Manager begint op sleutels', () => {
    for (const agent of HOOFD_AGENTS) expect(TOEGESTAAN[agent]).toContain('cursor');
    expect(normaliseer({ wingman: 'cursor', developer: 'claude' }).wingman).toBe('cursor');
    expect(normaliseer(null).northsea).toBe('sleutels');
  });

  it('respecteert een bewuste keuze voor API-sleutels', () => {
    const t = normaliseer({ wingman: 'sleutels', developer: 'cursor', trading: 'sleutels' });
    expect(t).toEqual({ wingman: 'sleutels', northsea: 'sleutels', trading: 'sleutels', developer: 'cursor', thinktank: 'codex2' });
  });

  it('overleeft onzin zonder uitzondering', () => {
    expect(normaliseer('kapot')).toEqual(STANDAARD_TOEWIJZING);
    expect(normaliseer({ wingman: 42, developer: 'gpt-9' })).toEqual(STANDAARD_TOEWIJZING);
  });

  it('toont in het menu geen abonnement dat al van een ander is', () => {
    const t = STANDAARD_TOEWIJZING; // trading=codex, developer=cursor, thinktank=codex2, wingman/northsea=sleutels
    // claude/claude2/claude3 zijn vrij zolang niemand ze heeft, dus die mag iedereen kiezen.
    expect(kiesbaar(t, 'wingman')).toEqual(['claude', 'claude2', 'claude3', 'sleutels']);
    expect(kiesbaar(t, 'northsea')).toEqual(['claude', 'claude2', 'claude3', 'sleutels']);
    expect(kiesbaar(t, 'trading')).toEqual(['claude', 'claude2', 'claude3', 'codex', 'sleutels']);
    expect(kiesbaar(t, 'developer')).toEqual(['claude', 'claude2', 'claude3', 'cursor', 'sleutels']);
    expect(kiesbaar(t, 'thinktank')).toEqual(['claude', 'claude2', 'claude3', 'codex2', 'sleutels']);
  });

  it('een nieuwe keuze wint en de vorige eigenaar krijgt API-sleutels', () => {
    const t = wijsToe(STANDAARD_TOEWIJZING, 'wingman', 'codex');
    expect(t.wingman).toBe('codex');
    expect(t.trading).toBe('sleutels');
    expect(abonnementVan(t, 'trading')).toBeNull();
  });
});

describe('de cascade van één agent', () => {
  const cascade = [
    { provider: 'abonnement', model: 'codex', key: '' },
    { provider: 'groq', model: 'llama', key: 'x' },
    { provider: 'ollama', model: 'qwen3.5:2b', key: '' },
  ];

  it('zet zijn eigen abonnement vooraan en haalt dat van een ander weg', () => {
    expect(cascadeVoorAgent(cascade, 'claude').map(s => `${s.provider}:${s.model}`))
      .toEqual(['abonnement:claude', 'groq:llama', 'ollama:qwen3.5:2b']);
  });

  it('draait zonder abonnement alleen op sleutels', () => {
    expect(cascadeVoorAgent(cascade, null).map(s => s.provider)).toEqual(['groq', 'ollama']);
  });
});
