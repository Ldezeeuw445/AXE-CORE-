import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const vpsLees = vi.fn();
vi.mock('@/infrastructure/gateways/axeCoreApiService', async (orig) => ({
  ...(await orig<Record<string, unknown>>()),
  ghGetFile: (...a: unknown[]) => vpsLees(...a),
}));

import { repoMetToken } from './gitViaInstellingen';
import { TOOL_RUNTIMES } from './toolRegistry';

// Deze testomgeving geeft geen bruikbare localStorage; een eigen kleine opslag is voldoende.
function nieuweOpslag() {
  const m = new Map<string, string>();
  return {
    getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => { m.set(k, v); },
    removeItem: (k: string) => { m.delete(k); }, clear: () => m.clear(),
  };
}
function zetRepos(repos: Array<Record<string, string>>) {
  localStorage.setItem('axe_github_repos', JSON.stringify(repos));
}
const kern = { label: 'x', branch: 'orchestrator', srcPrefix: '' };

beforeEach(() => { vi.stubGlobal('localStorage', nieuweOpslag()); vpsLees.mockReset(); });
afterEach(() => { vi.unstubAllGlobals(); });

describe('repoMetToken', () => {
  it('vindt de Settings-repo op owner/repo, ongeacht hoofdletters, en alleen mét token', () => {
    zetRepos([
      { id: 'axe-core', owner: 'Ldezeeuw445', repo: 'AXE-CORE-', token: 'ghp_a', ...kern },
      { id: 'axon', owner: 'Ldezeeuw445', repo: 'axon-memory', token: '', ...kern },
    ]);
    expect(repoMetToken('ldezeeuw445/axe-core-')?.id).toBe('axe-core');
    expect(repoMetToken('Ldezeeuw445/axon-memory')).toBeNull();   // geen token ingevuld
    expect(repoMetToken('iemand/anders')).toBeNull();
    expect(repoMetToken('kapot')).toBeNull();
  });
});

describe('GIT_READ met het token uit Settings', () => {
  const gitRead = () => TOOL_RUNTIMES.find(t => t.id === 'git_read')!;

  it('leest direct van GitHub met het Settings-token en raakt de VPS niet aan (daar is het token ingetrokken)', async () => {
    zetRepos([{ id: 'axe-core', owner: 'Ldezeeuw445', repo: 'AXE-CORE-', token: 'ghp_settings', ...kern }]);
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ content: btoa('hallo'), sha: 'abc' }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    const uit = await gitRead().run(JSON.stringify({ repo: 'Ldezeeuw445/AXE-CORE-', path: 'README.md' }), { requestApproval: async () => true });
    expect(uit).toContain('hallo');
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, { headers: Record<string, string> }];
    expect(url).toContain('api.github.com/repos/Ldezeeuw445/AXE-CORE-/contents/README.md?ref=orchestrator');
    expect(init.headers.Authorization).toBe('Bearer ghp_settings');
    expect(vpsLees).not.toHaveBeenCalled();
  });

  it('gaat voor een repo zonder Settings-token nog steeds via de VPS', async () => {
    zetRepos([]);
    vpsLees.mockResolvedValue({ path: 'a', content: 'van de vps', sha: 's' });
    const uit = await gitRead().run(JSON.stringify({ repo: 'iemand/anders', path: 'a' }), { requestApproval: async () => true });
    expect(uit).toContain('van de vps');
  });

  it('zegt wat GitHub zegt als het Settings-token geweigerd wordt', async () => {
    zetRepos([{ id: 'axe-core', owner: 'Ldezeeuw445', repo: 'AXE-CORE-', token: 'ghp_dood', ...kern }]);
    vi.stubGlobal('fetch', vi.fn(async () => new Response('Bad credentials', { status: 401 })));
    await expect(gitRead().run(JSON.stringify({ repo: 'Ldezeeuw445/AXE-CORE-', path: 'x' }), { requestApproval: async () => true }))
      .rejects.toThrow(/401/);
  });
});
