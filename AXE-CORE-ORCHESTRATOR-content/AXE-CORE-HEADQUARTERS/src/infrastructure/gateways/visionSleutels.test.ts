/**
 * Vision zag providers niet die de chat wél zag.
 *
 * `configuredVisionSlots()` had een eigen kopie van de sleuteloplossing: een
 * eigen ENV-lijst en een eigen localStorage-parse. Daardoor miste hij de
 * providers waarvan de VPS-proxy de sleutel levert — had je Gemini alleen via
 * de proxy, dan zei Settings "Connected" en zag vision niets.
 *
 * Deze test legt dat vast op de plek waar het misging.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';

const opslag = new Map<string, string>();
vi.stubGlobal('localStorage', {
  getItem: (k: string) => opslag.get(k) ?? null,
  setItem: (k: string, v: string) => { opslag.set(k, v); },
  removeItem: (k: string) => { opslag.delete(k); },
});

const { configuredVisionSlots } = await import('./visionGateway');

describe('configuredVisionSlots', () => {
  beforeEach(() => opslag.clear());

  it('ziet een provider die de VPS-proxy met zijn eigen sleutel bedient', () => {
    opslag.set('axe_server_providers', JSON.stringify(['google']));
    const ids = configuredVisionSlots().map((s) => s.provider);
    expect(ids).toContain('google');
  });

  it('ziet een provider waarvan de sleutel in Settings staat', () => {
    opslag.set('axe_llm_connections', JSON.stringify({ anthropic: { key: 'sk-ant-test' } }));
    expect(configuredVisionSlots().map((s) => s.provider)).toContain('anthropic');
  });

  it('geeft niets terug als er nergens iets staat', () => {
    expect(configuredVisionSlots()).toEqual([]);
  });

  it('kijkt alleen naar providers die beeld aankunnen', () => {
    opslag.set('axe_llm_connections', JSON.stringify({
      groq: { key: 'gsk-test' },
      openai: { key: 'sk-test' },
    }));
    const ids = configuredVisionSlots().map((s) => s.provider);
    expect(ids).toContain('openai');
    expect(ids).not.toContain('groq');
  });
});
