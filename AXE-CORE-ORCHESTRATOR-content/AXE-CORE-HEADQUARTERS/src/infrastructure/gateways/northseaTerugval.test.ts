/**
 * 24 nov: de NorthSea Desk toonde "Cannot reach mac-mini-van-luka...:8443" terwijl
 * de Mac mini zichzelf opnieuw bouwde. De VPS heeft dezelfde /northsea/-gegevens;
 * die moet de desk dan gebruiken -- maar nooit voor /claude/*.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { __resetAgentHost, zetAgentHostVoorkeur, agentHostStand, LOKALE_AGENT_ORIGIN, lokaleAgentFetchOrigin } from '@/infrastructure/config/agentHost';
import { northseaOverzicht, osintLayer } from './axeCoreApiService';

function stubOpslag() {
  const bak = new Map<string, string>();
  (globalThis as unknown as { localStorage: Storage }).localStorage = {
    getItem: (k: string) => bak.get(k) ?? null, setItem: (k: string, v: string) => { bak.set(k, v); },
    removeItem: (k: string) => { bak.delete(k); }, clear: () => bak.clear(), key: () => null, length: 0,
  } as Storage;
}

beforeEach(() => { stubOpslag(); __resetAgentHost(); zetAgentHostVoorkeur('auto'); });
afterEach(() => { vi.unstubAllGlobals(); });

/** /health van de Mac mini antwoordt (probe ok), maar daarna is hij weg. */
const MINI = lokaleAgentFetchOrigin();

function macMiniValtWeg() {
  const f = vi.fn(async (url: string) => {
    if (url === `${LOKALE_AGENT_ORIGIN}/health`) return { ok: true, json: async () => ({}) };
    if (url.startsWith(MINI)) throw new TypeError('Load failed');
    return { ok: true, json: async () => ({ pipeline: [], tellers: { bron: 'vps' } }) };
  });
  vi.stubGlobal('fetch', f);
  return f;
}

describe('NorthSea Desk valt terug op de VPS', () => {
  it('haalt het overzicht van de VPS als de Mac mini niet antwoordt, en zegt dat', async () => {
    const f = macMiniValtWeg();
    const uit = await northseaOverzicht();
    expect(uit).toMatchObject({ tellers: { bron: 'vps' } });
    const urls = f.mock.calls.map(c => String(c[0]));
    expect(urls.some(u => u.startsWith(MINI) && u.includes('/northsea/'))).toBe(true);
    expect(urls.some(u => !u.startsWith(MINI) && u.includes('/northsea/'))).toBe(true);
    expect(agentHostStand()).toBe('vps');
  });

  it('wie "lokaal" koos ziet de fout, geen stille terugval', async () => {
    zetAgentHostVoorkeur('lokaal');
    macMiniValtWeg();
    await expect(northseaOverzicht()).rejects.toThrow(/Cannot reach/);
  });

  it('andere paden vallen niet terug', async () => {
    const f = vi.fn(async () => { throw new TypeError('Load failed'); });
    vi.stubGlobal('fetch', f);
    await expect(osintLayer('air')).rejects.toThrow(/Cannot reach/);
    expect(f).toHaveBeenCalledTimes(1);
  });
});
