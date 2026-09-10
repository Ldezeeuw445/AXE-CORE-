import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Alleen de browser-agent verhuist mee; de rest van de API niet.
 *
 * Dat onderscheid is de hele truc. Een browser-agent op de Mac Mini is prima,
 * maar de handel, het geheugen en de status horen bij de VPS-API te blijven --
 * anders praat de app tegen een machine die die routes niet eens heeft.
 */

const basis = vi.fn<() => Promise<string>>();

vi.mock('@/infrastructure/persistence/browserHostService', () => ({
  browserBasis: () => basis(),
}));

const api = await import('@/infrastructure/gateways/axeCoreApiService');

const antwoord = () => Promise.resolve({
  ok: true,
  json: () => Promise.resolve({ session_id: 's1', status: 'ok' }),
} as unknown as Response);

let gevraagd: string[] = [];

beforeEach(() => {
  gevraagd = [];
  basis.mockReset();
  vi.stubGlobal('fetch', vi.fn((url: string) => { gevraagd.push(String(url)); return antwoord(); }));
});

describe('waar een aanroep heen gaat', () => {
  it('stuurt de browser-agent naar de gekozen host', async () => {
    basis.mockResolvedValue('http://mac-mini.ts.net:8099');
    await api.browserAgentStart();
    expect(gevraagd[0]).toBe('http://mac-mini.ts.net:8099/browser/agent/session');
  });

  it('laat de rest van de API met rust', async () => {
    basis.mockResolvedValue('http://mac-mini.ts.net:8099');
    await api.checkAxeApi();
    expect(gevraagd[0]).not.toContain('mac-mini');
    expect(gevraagd[0]).toContain('/health');
  });

  it('valt terug op de VPS als er geen host gekozen is', async () => {
    basis.mockResolvedValue('');
    await api.browserAgentStart();
    expect(gevraagd[0]).not.toContain('mac-mini');
    expect(gevraagd[0]).toContain('/browser/agent/session');
  });

  it('valt terug op de VPS als de instelling onleesbaar is', async () => {
    // Een kapotte voorkeur mag de browser niet stilzetten.
    basis.mockRejectedValue(new Error('instelling onbereikbaar'));
    await api.browserAgentStart();
    expect(gevraagd[0]).toContain('/browser/agent/session');
    expect(gevraagd[0]).not.toContain('mac-mini');
  });
});
