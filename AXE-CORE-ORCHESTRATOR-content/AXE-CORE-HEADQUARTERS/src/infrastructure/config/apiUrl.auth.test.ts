import { afterEach, describe, expect, it, vi } from 'vitest';

const SLEUTEL = 'test-axe-core-sleutel';
const VPS = 'https://api.axecompanion.com';
const LOKAAL = 'https://mac-mini-van-luka.tail03735e.ts.net:8443';

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

async function laad() {
  vi.resetModules();
  vi.stubEnv('VITE_AXE_CORE_API_KEY', SLEUTEL);
  vi.stubEnv('VITE_LOKALE_AGENT_ORIGIN', LOKAAL);
  return import('./apiUrl');
}

describe('axeApiAuthHeaders', () => {
  it('laat relatieve proxy-paden leeg: Vite/Vercel hangen de sleutel server-side', async () => {
    const { axeApiAuthHeaders } = await laad();
    expect(axeApiAuthHeaders('/proxy/lokale-agent/northsea/overzicht')).toEqual({});
    expect(axeApiAuthHeaders('/proxy/axecore/northsea/overzicht')).toEqual({});
  });

  it('stuurt Bearer naar de Mac-mini-agent en de VPS, verder nergens', async () => {
    const { axeApiAuthHeaders } = await laad();
    expect(axeApiAuthHeaders(`${LOKAAL}/northsea/overzicht`)).toEqual({ Authorization: `Bearer ${SLEUTEL}` });
    expect(axeApiAuthHeaders(`${VPS}/northsea/overzicht`)).toEqual({ Authorization: `Bearer ${SLEUTEL}` });
    expect(axeApiAuthHeaders('https://example.com/x')).toEqual({});
  });
});
