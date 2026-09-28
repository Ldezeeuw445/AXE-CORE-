import { afterEach, describe, expect, it, vi } from 'vitest';
import { installeerWebProxyAuth } from './webProxyAuth';

const BASIS = 'https://pqnngpcgbdwxavbatbia.supabase.co/functions/v1/axe-core-proxy';
const echt = globalThis.fetch;
afterEach(() => { globalThis.fetch = echt; });

function installeer(token: string | null = 'sessie-jwt') {
  const onder = vi.fn(async (..._args: unknown[]) => new Response('{}'));
  globalThis.fetch = onder as unknown as typeof fetch;
  installeerWebProxyAuth(BASIS, async () => token, 'anon');
  return onder;
}

const kop = (init: unknown, naam: string) => new Headers((init as RequestInit).headers).get(naam);

describe('de sessie op verzoeken naar de web-proxy', () => {
  it('zet de sessie en de anon-sleutel op een verzoek naar de proxy', async () => {
    const onder = installeer();
    await fetch(`${BASIS}/memory/stats`, { headers: { 'Content-Type': 'application/json' } });
    const [, init] = onder.mock.calls[0];
    expect(kop(init, 'Authorization')).toBe('Bearer sessie-jwt');
    expect(kop(init, 'apikey')).toBe('anon');
    expect(kop(init, 'Content-Type')).toBe('application/json');
  });

  it('vervangt een eigen Authorization: de proxy kent alleen de sessie', async () => {
    const onder = installeer();
    await fetch(`${BASIS}/proxy/ai`, { method: 'POST', headers: { Authorization: 'Bearer providersleutel' } });
    expect(kop(onder.mock.calls[0][1], 'Authorization')).toBe('Bearer sessie-jwt');
  });

  it('laat elk ander adres ongemoeid', async () => {
    const onder = installeer();
    await fetch('https://api.axecompanion.com/health', { headers: { Authorization: 'Bearer eigen' } });
    await fetch('/assets/x.js');
    expect(onder.mock.calls[0][1]).toEqual({ headers: { Authorization: 'Bearer eigen' } });
    expect(onder.mock.calls[1][1]).toBeUndefined();
  });

  it('werkt ook met een Request als invoer', async () => {
    const onder = installeer();
    await fetch(new Request(`${BASIS}/health`));
    const doorgegeven = onder.mock.calls[0][0] as Request;
    expect(doorgegeven.headers.get('Authorization')).toBe('Bearer sessie-jwt');
  });

  it('stuurt zonder sessie gewoon door; de proxy antwoordt dan zelf 401', async () => {
    const onder = installeer(null);
    await fetch(`${BASIS}/health`);
    expect(kop(onder.mock.calls[0][1], 'Authorization')).toBeNull();
  });
});
