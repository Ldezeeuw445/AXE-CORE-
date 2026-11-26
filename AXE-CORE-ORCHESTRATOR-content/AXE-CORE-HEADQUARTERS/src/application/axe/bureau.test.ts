import { beforeEach, describe, expect, it, vi } from 'vitest';

const opslag: Array<{ key: string; value: string }> = [];
vi.mock('@/infrastructure/gateways/axeCoreApiService', () => ({
  memList: vi.fn(async () => opslag.map((r) => ({ ...r }))),
  memUpsert: vi.fn(async (rijen: Array<{ key: string; value: string }>) => {
    for (const r of rijen) {
      const i = opslag.findIndex((x) => x.key === r.key);
      if (i >= 0) opslag[i] = r; else opslag.push(r);
    }
    return rijen;
  }),
}));
vi.mock('@/infrastructure/persistence/chatPersistence', () => ({ AXE_USER_ID: 'luka' }));

import { _resetBureau, archiveerLink, bureauBeurt, bureauContext, haalBureau } from './bureau';

describe('Bureau I/O', () => {
  beforeEach(() => { opslag.length = 0; _resetBureau(); });

  it('gewone chat raakt het bureau niet', async () => {
    expect(await bureauBeurt('hoe laat is het')).toBeNull();
    expect(opslag).toHaveLength(0);
  });

  it('bewaart, werkt bij, archiveert zonder te wissen', async () => {
    expect(await bureauBeurt('bewaar resend.com in Tools: mail voor NorthSea')).toContain('Tools');
    expect(await bureauBeurt('bewaar https://resend.com/ in Mail')).toContain('Mail');
    expect(opslag).toHaveLength(1);
    const [l] = await haalBureau(true);
    expect(l).toMatchObject({ map: 'Mail', waarom: 'mail voor NorthSea' });
    expect(bureauContext('wat staat op mijn bureau')).toContain('resend.com');
    await archiveerLink(l);
    expect(opslag).toHaveLength(1);
    expect(await bureauBeurt('wat staat er op mijn bureau')).toContain('leeg');
  });
});
