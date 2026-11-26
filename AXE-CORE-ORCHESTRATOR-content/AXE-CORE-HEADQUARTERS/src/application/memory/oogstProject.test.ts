import { beforeEach, describe, expect, it, vi } from 'vitest';

const geheugen: Array<{ key: string; content: string; category: string; created_at: string }> = [];
vi.mock('@/infrastructure/gateways/axeCoreApiService', () => ({
  sbGetRows: vi.fn(async (_t: string, o: { filterVal: string }) => geheugen.filter((r) => r.category === o.filterVal)),
}));
const bewaar = vi.fn(async (i: { key: string; content: string; category: string }) => {
  geheugen.push({ ...i, key: `${i.key}:abcdef0123456789`, created_at: '2026-11-26T09:00:00Z' });
  return true;
});
vi.mock('@/infrastructure/persistence/agentMemoryService', () => ({ remember: (i: never) => bewaar(i) }));

import { oogstBeurt } from './oogstProject';

const RAPPORT = '# Bureau bouwen\n\n- Agent: axemanager\n- Uitkomst: klaar\n\n## Opdracht\n\nBouw het bureau\n\n## Resultaat\n\nStaat live.';

describe('oogstProject', () => {
  beforeEach(() => { geheugen.length = 0; bewaar.mockClear(); });

  it('gewone chat doet niets', async () => {
    expect(await oogstBeurt('hoe gaat het')).toBeNull();
  });

  it('schrijft het artikel en kijkt na dat het er staat', async () => {
    geheugen.push({ key: 'projects/bureau-job-1-0:1234567890abcdef', content: RAPPORT, category: 'projects', created_at: '2026-11-26T08:00:00Z' });
    const a = await oogstBeurt('oogst AXE CORE');
    expect(a).toContain('wiki/axe-core');
    expect(bewaar).toHaveBeenCalledWith(expect.objectContaining({ category: 'wiki', key: 'wiki/axe-core' }));
  });

  it('zegt het eerlijk als er niets is of het niet bewaard werd', async () => {
    expect(await oogstBeurt('oogst Niets')).toContain('geen rapporten');
    geheugen.push({ key: 'projects/bureau-job-1-0:1234567890abcdef', content: RAPPORT, category: 'projects', created_at: '2026-11-26T08:00:00Z' });
    bewaar.mockImplementationOnce(async () => true);
    expect(await oogstBeurt('oogst AXE CORE')).toContain('niet bewaard');
  });
});
