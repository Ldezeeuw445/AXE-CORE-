import { afterEach, describe, expect, it, vi } from 'vitest';
import { openEigenApp } from './eigenAppShell';
import { SHELL_VERTROUWEN, shellFoutTekst } from '@/domain/eigenAppSessie';

const GEHEIM = /access_token|refresh_token|id_token|type=recovery|(?:^|[?#&])code=/i;

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('radiale shell-navigatie', () => {
  it('window.open krijgt alleen de vertrouwde HTTPS-URL, zonder tokens', async () => {
    const open = vi.fn();
    vi.stubGlobal('window', { open, location: { hash: '' } });

    expect(await openEigenApp('companion')).toContain('opened in a new tab');
    expect(await openEigenApp('trading-os')).toContain('opened in a new tab');
    expect(await openEigenApp('axon')).toContain('opened in a new tab');

    const urls = open.mock.calls.map(c => String(c[0]));
    expect(urls).toEqual([
      SHELL_VERTROUWEN.companion.url,
      SHELL_VERTROUWEN['trading-os'].url,
      SHELL_VERTROUWEN.axon.url,
    ]);
    for (const aanroep of open.mock.calls) {
      expect(aanroep[1]).toBe('_blank');
      expect(aanroep[2]).toBe('noopener,noreferrer');
      expect(String(aanroep[0])).not.toMatch(GEHEIM);
      expect(String(aanroep[0]).includes('#')).toBe(false);
    }
  });

  it('lokale AXE-pagina\'s navigeren intern, niet naar een vijandige liveUrl', async () => {
    const open = vi.fn();
    const location = { hash: '' };
    vi.stubGlobal('window', { open, location });
    expect(await openEigenApp('developer')).toContain('opened here');
    expect(open).not.toHaveBeenCalled();
    expect(location.hash).toMatch(/^#/);
    expect(location.hash).not.toMatch(GEHEIM);
  });

  it('redacteert tokens uit Tauri-foutpayloads', () => {
    const tekst = shellFoutTekst(
      'companion',
      'https://axecompanion.com/chat#access_token=kern-a&refresh_token=kern-r',
    );
    expect(tekst).not.toMatch(GEHEIM);
    expect(tekst).not.toContain('kern-a');
    expect(tekst.startsWith('shell companion: ')).toBe(true);
  });
});
