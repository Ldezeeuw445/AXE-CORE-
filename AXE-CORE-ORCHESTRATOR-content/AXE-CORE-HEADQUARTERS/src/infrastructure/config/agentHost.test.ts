import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  agentBasis, agentHostStand, zetAgentHostVoorkeur, agentHostVoorkeur,
  __resetAgentHost, LOKALE_AGENT_ORIGIN,
} from '@/infrastructure/config/agentHost';

const VPS = 'https://api.axecompanion.com';

/** localStorage bestaat niet in deze testomgeving; de module vangt dat op, maar
 *  om de voorkeur te kunnen zetten heeft hij er wel een nodig. */
function stubOpslag() {
  const bak = new Map<string, string>();
  (globalThis as unknown as { localStorage: Storage }).localStorage = {
    getItem: (k: string) => bak.get(k) ?? null,
    setItem: (k: string, v: string) => { bak.set(k, v); },
    removeItem: (k: string) => { bak.delete(k); },
    clear: () => bak.clear(),
    key: () => null,
    length: 0,
  } as Storage;
}

beforeEach(() => {
  stubOpslag();
  __resetAgentHost();
  zetAgentHostVoorkeur('auto');
});

afterEach(() => { vi.unstubAllGlobals(); });

function fetchAntwoordt(ok: boolean) {
  const f = vi.fn().mockResolvedValue({ ok });
  vi.stubGlobal('fetch', f);
  return f;
}

function fetchWeigert() {
  const f = vi.fn().mockRejectedValue(new Error('ECONNREFUSED'));
  vi.stubGlobal('fetch', f);
  return f;
}

describe('waar de codeeragent draait', () => {
  it('vps: altijd de VPS, en er wordt niet gepolst', async () => {
    const f = fetchAntwoordt(true);
    zetAgentHostVoorkeur('vps');

    expect(await agentBasis(VPS)).toBe(VPS);
    expect(agentHostStand()).toBe('vps');
    expect(f).not.toHaveBeenCalled();
  });

  it('lokaal: altijd deze machine, ook als die niet antwoordt', async () => {
    // Met opzet geen terugval. Je hebt expliciet gekozen, dus een mislukking
    // hoort zichtbaar te zijn en niet stilletjes op de deploy-kopie uit te komen.
    const f = fetchWeigert();
    zetAgentHostVoorkeur('lokaal');

    expect(await agentBasis(VPS)).toBe(LOKALE_AGENT_ORIGIN);
    expect(agentHostStand()).toBe('lokaal');
    expect(f).not.toHaveBeenCalled();
  });

  it('auto: lokaal zodra die antwoordt', async () => {
    fetchAntwoordt(true);
    expect(await agentBasis(VPS)).toBe(LOKALE_AGENT_ORIGIN);
    expect(agentHostStand()).toBe('lokaal');
  });

  it('auto: terug naar de VPS als lokaal niet draait — en dat is af te lezen', async () => {
    fetchWeigert();
    expect(await agentBasis(VPS)).toBe(VPS);
    // Het scherm moet dit kunnen tonen. Een stille terugval laat je in de
    // verkeerde map werken terwijl alles er goed uitziet.
    expect(agentHostStand()).toBe('vps');
  });

  it('auto: een lokale 500 telt als niet beschikbaar', async () => {
    fetchAntwoordt(false);
    expect(await agentBasis(VPS)).toBe(VPS);
  });

  it('polst niet bij elke aanroep', async () => {
    const f = fetchAntwoordt(true);
    await agentBasis(VPS);
    await agentBasis(VPS);
    await agentBasis(VPS);
    expect(f).toHaveBeenCalledTimes(1);
  });

  it('polst opnieuw zodra je de voorkeur wijzigt', async () => {
    // Anders blijft "lokaal draait niet" hangen nadat je run-local.sh hebt
    // gestart, en lijkt de keuze te worden genegeerd.
    const f = fetchAntwoordt(true);
    await agentBasis(VPS);
    zetAgentHostVoorkeur('auto');
    await agentBasis(VPS);
    expect(f).toHaveBeenCalledTimes(2);
  });

  it('valt terug op auto zonder opgeslagen keuze', () => {
    localStorage.removeItem('axe_agent_host');
    expect(agentHostVoorkeur()).toBe('auto');
  });

  it('vraagt /health en niet een endpoint met een sleutel', async () => {
    // /claude/repos wil een Bearer-token. Een ontbrekende sleutel zou dan lezen
    // als "lokaal draait niet", en dat zijn twee verschillende problemen.
    const f = fetchAntwoordt(true);
    await agentBasis(VPS);
    expect(f.mock.calls[0][0]).toBe(`${LOKALE_AGENT_ORIGIN}/health`);
  });
});
