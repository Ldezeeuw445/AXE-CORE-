import { describe, it, expect } from 'vitest';
import {
  normaliseer, kiesbaar, wijsToe, abonnementVan, cascadeVoorAgent,
  STANDAARD_TOEWIJZING, TOEGESTAAN, HOOFD_AGENTS,
} from '@/domain/agentMotoren';

describe('drie agents, drie abonnementen', () => {
  it('begint met elk abonnement bij één agent', () => {
    const t = normaliseer(null);
    expect(t).toEqual(STANDAARD_TOEWIJZING);
    const abonnementen = HOOFD_AGENTS.map(a => t[a]).filter(m => m !== 'sleutels');
    expect(new Set(abonnementen).size).toBe(abonnementen.length);
  });

  it('laat een abonnement nooit bij twee agents staan, ook niet uit een oude opgeslagen waarde', () => {
    const t = normaliseer({ 'axe-core': 'codex', 'code-agent': 'codex', 'axe-algo': 'codex' });
    expect(t['axe-core']).toBe('codex');
    expect(t['code-agent']).toBe('cursor');   // valt terug op zijn standaard, die vrij is
    expect(t['axe-algo']).toBe('sleutels');   // zijn standaard (codex) is bezet
  });

  it('elke agent mag elk abonnement, ook Cursor, en de Maps Agent begint op sleutels', () => {
    for (const agent of HOOFD_AGENTS) expect(TOEGESTAAN[agent]).toContain('cursor');
    expect(normaliseer({ 'axe-core': 'cursor', 'code-agent': 'claude' })['axe-core']).toBe('cursor');
    expect(normaliseer(null)['maps-agent']).toBe('sleutels');
  });

  it('respecteert een bewuste keuze voor API-sleutels', () => {
    const t = normaliseer({ 'axe-core': 'sleutels', 'code-agent': 'cursor', 'axe-algo': 'sleutels' });
    expect(t).toEqual({ 'axe-core': 'sleutels', 'code-agent': 'cursor', 'axe-algo': 'sleutels', 'maps-agent': 'sleutels' });
  });

  it('overleeft onzin zonder uitzondering', () => {
    expect(normaliseer('kapot')).toEqual(STANDAARD_TOEWIJZING);
    expect(normaliseer({ 'axe-core': 42, 'code-agent': 'gpt-9' })).toEqual(STANDAARD_TOEWIJZING);
  });

  it('toont in het menu geen abonnement dat al van een ander is', () => {
    const t = STANDAARD_TOEWIJZING; // core=claude, code=cursor, algo=codex
    // claude2 is vrij zolang niemand hem heeft, dus die mag iedereen kiezen.
    expect(kiesbaar(t, 'axe-core')).toEqual(['claude', 'claude2', 'claude3', 'claude4', 'sleutels']);
    expect(kiesbaar(t, 'code-agent')).toEqual(['claude2', 'claude3', 'claude4', 'cursor', 'sleutels']);
    expect(kiesbaar(t, 'maps-agent')).toEqual(['claude2', 'claude3', 'claude4', 'sleutels']);
  });

  it('een nieuwe keuze wint en de vorige eigenaar krijgt API-sleutels', () => {
    const t = wijsToe(STANDAARD_TOEWIJZING, 'axe-core', 'codex');
    expect(t['axe-core']).toBe('codex');
    expect(t['axe-algo']).toBe('sleutels');
    expect(abonnementVan(t, 'axe-algo')).toBeNull();
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
