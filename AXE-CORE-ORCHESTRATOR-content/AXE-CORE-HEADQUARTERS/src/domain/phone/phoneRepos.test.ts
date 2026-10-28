import { describe, expect, it } from 'vitest';
import { telefoonRepoLijst } from './phoneRepos';

const GITHUB = [
  { id: 'axe-core', label: 'AXE CORE', owner: 'Ldezeeuw445', repo: 'AXE-CORE-', branch: 'orchestrator' },
  { id: 'axe-companion', label: 'AXE Companion OS', owner: 'Ldezeeuw445', repo: 'AXE-COMPANION-OS-', branch: 'main' },
  { id: 'trading-os', label: 'Trading OS', owner: 'Ldezeeuw445', repo: 'trading-os-app', branch: 'snapshot-2026-10-17' },
  { id: 'axon', label: 'AXON Memory', owner: 'Ldezeeuw445', repo: 'axon-memory', branch: 'main' },
  { id: 'axe-core-android', label: 'AXE CORE Android', owner: 'Ldezeeuw445', repo: 'axe-core-android', branch: 'main' },
] as const;

describe('telefoonRepoLijst', () => {
  it('toont de GitHub-registry ook als de host alleen axe-core heeft', () => {
    const uit = telefoonRepoLijst({
      host: { 'axe-core': { branch: 'orchestrator', runnable: true } },
      github: GITHUB,
      huidig: 'axe-core',
    });
    expect(uit.map((r) => r.id)).toEqual([
      'axe-core', 'axe-companion', 'trading-os', 'axon', 'axe-core-android',
    ]);
    expect(uit[0].open).toBe(true);
    expect(uit[0].host).toBe(true);
    expect(uit[1].host).toBe(false);
    expect(uit[1].sub).toContain('Ldezeeuw445/AXE-COMPANION-OS-');
  });

  it('blijft de registry tonen als de host onbereikbaar is', () => {
    const uit = telefoonRepoLijst({ host: null, github: GITHUB, huidig: '' });
    expect(uit.length).toBe(GITHUB.length);
    expect(uit.every((r) => r.sub.includes('github'))).toBe(true);
  });
});
