import { afterEach, describe, expect, it, vi } from 'vitest';
import { AXE_KOKORO_VOICE, AXE_TTS_ORIGIN, probeGeorgeStem } from '@/infrastructure/gateways/kokoroTtsService';
import { AXE_STEM_ID, STEM_UI } from '@/domain/stemIdentiteit';

afterEach(() => { vi.unstubAllGlobals(); });

describe('probeGeorgeStem', () => {
  it('vraagt /health op de lokale stemdienst, niet een andere poort', async () => {
    const f = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ ok: true, voice: 'bm_george' }),
    });
    vi.stubGlobal('fetch', f);
    const stand = await probeGeorgeStem();
    expect(f.mock.calls[0][0]).toBe(`${AXE_TTS_ORIGIN}/health`);
    expect(AXE_TTS_ORIGIN).toMatch(/127\.0\.0\.1:8766/);
    expect(AXE_KOKORO_VOICE).toBe(AXE_STEM_ID);
    expect(stand).toEqual({ ok: true, regel: STEM_UI.live, watNu: null });
  });

  it('dienst weg → rood, met wat je eraan doet', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('ECONNREFUSED')));
    const stand = await probeGeorgeStem();
    expect(stand.ok).toBe(false);
    expect(stand.regel).toBe(STEM_UI.dood);
    expect(stand.watNu).toContain('install.sh');
    expect(stand.watNu).toContain('ECONNREFUSED');
  });
});
