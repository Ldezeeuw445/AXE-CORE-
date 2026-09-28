/**
 * Een half opgeslagen repo-config mag de app niet zwart trekken.
 *
 * CodeAgentPanel rendert `r.label.replace(...)` en `repo.repo.replace(...)`.
 * Een oudere of half-gesyncte config zonder die velden gaf `undefined.replace`
 * en nam via de gedeelde ErrorBoundary de hele pagina mee. `loadRepoConfigs`
 * hoort daarom nooit een config met ontbrekende strings terug te geven.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { loadRepoConfigs } from './repoConfigService';

// Node-testomgeving heeft geen localStorage; een kleine in-memory stub volstaat.
// loadRepoConfigs leest localStorage pas bij aanroep, dus dit hoeft alleen te
// bestaan voordat een test draait, niet vóór de import.
const store = new Map<string, string>();
(globalThis as { localStorage?: Storage }).localStorage = {
  getItem: (k: string) => store.get(k) ?? null,
  setItem: (k: string, v: string) => { store.set(k, String(v)); },
  removeItem: (k: string) => { store.delete(k); },
  clear: () => store.clear(),
  key: () => null,
  length: 0,
} as Storage;

beforeEach(() => store.clear());

describe('loadRepoConfigs', () => {
  it('coerces a malformed stored entry to whole strings instead of undefined', () => {
    // Een custom repo zonder repo/owner/label — precies wat de crash gaf.
    localStorage.setItem('axe_github_repos', JSON.stringify([
      { id: 'kapot' },
    ]));
    const repos = loadRepoConfigs();
    for (const r of repos) {
      expect(typeof r.label).toBe('string');
      expect(typeof r.repo).toBe('string');
      expect(typeof r.owner).toBe('string');
      // Het overleeft de render-aanroep die de app deed omvallen.
      expect(() => r.label.replace(/^AXE\s+/i, '')).not.toThrow();
    }
  });

  it('drops an entry that has neither id nor repo rather than returning junk', () => {
    localStorage.setItem('axe_github_repos', JSON.stringify([{ token: 'x' }]));
    const repos = loadRepoConfigs();
    expect(repos.every((r) => r.id || r.repo)).toBe(true);
  });

  it('still returns the defaults when nothing is stored', () => {
    const repos = loadRepoConfigs();
    expect(repos.some((r) => r.id === 'axe-core')).toBe(true);
  });
});
