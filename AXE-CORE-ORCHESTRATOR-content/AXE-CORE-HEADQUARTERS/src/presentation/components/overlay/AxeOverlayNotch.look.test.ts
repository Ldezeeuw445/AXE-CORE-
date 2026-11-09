import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const dir = dirname(fileURLToPath(import.meta.url));
const css = readFileSync(join(dir, 'AxeOverlayNotch.css'), 'utf8');
const floatTsx = readFileSync(join(dir, '../../pages/FloatAxe.tsx'), 'utf8');
const useLook = readFileSync(join(dir, '../../hooks/useLook.ts'), 'utf8');
const zweef = readFileSync(join(dir, '../../../infrastructure/gateways/zwevendeVensters.ts'), 'utf8');
const rust = readFileSync(
  join(dir, '../../../../src-tauri/src/lib.rs'),
  'utf8',
);
const surface = readFileSync(
  join(dir, '../../../design/axe-surface.css'),
  'utf8',
);

describe('AxeOverlayNotch vaste HQ-schil', () => {
  it('notch houdt de kleur van de app en volgt de look-wissel niet', () => {
    // Eén vaste stand, in de kleur van --axe-surface (#0A0A0A = 10,10,10).
    // Sinds 5 nov mét dekking, want Luka wil hem doorzichtig zoals de
    // Tauri-schil. Dat is iets anders dan meeschakelen met data-look: die
    // regels mogen er nog steeds niet zijn, en dat is wat hieronder staat.
    expect(surface).toMatch(/--axe-surface:\s*#0A0A0A/);
    expect(css).toMatch(/--axe-notch-shell:\s*rgba\(10,\s*10,\s*10,\s*0?\.\d+\)/);
    expect(css).toContain('background: var(--axe-notch-shell)');
    expect(css).toContain('NOTCH_SHELL_FIXED');
    expect(css).not.toContain(":root[data-look='glass'] .axe-ov");
    expect(css).not.toContain(":root[data-look='black'] .axe-ov");
    expect(css).not.toContain('rgba(248, 250, 253');
  });

  it('doorzichtig betekent ook wazig glas erachter, niet alleen minder dekking', () => {
    // Zonder blur kijk je door de notch heen naar scherpe vensters en is tekst
    // erin niet te lezen. De -webkit-variant hoort erbij: de WebKit in de
    // Tauri-webview heeft de losse eigenschap nog nodig.
    expect(css).toMatch(/\.axe-ov \{[^}]*backdrop-filter:\s*blur\(/s);
    expect(css).toMatch(/-webkit-backdrop-filter:\s*blur\(/);
  });

  it('knoppen hebben vaste vulling en cyaan-accent bij hover/pressed', () => {
    expect(css).toContain('--axe-notch-btn: #111111');
    expect(css).toContain('--axe-notch-accent: #22D3EE');
    expect(css).toMatch(/\.axe-ov__ico:hover\s*\{[^}]*var\(--axe-notch-accent\)/s);
    expect(css).toMatch(/\.axe-ov__ico\[aria-pressed="true"\],\s*\.axe-ov__ico--hot\s*\{[^}]*background:\s*var\(--axe-notch-accent\)/s);
  });

  it('clip-path maskeert de afgeronde onderhoeken (geen OS-rechthoek-streepjes)', () => {
    expect(css).toContain('html[data-axe-notch]');
    expect(css).toMatch(/clip-path:\s*inset\(0 round 0 0/);
    expect(css).not.toMatch(/\.axe-ov \{[^}]*0 16px 40px rgba\(0, 0, 0/);
  });

  it('FloatAxe schrijft ~/.axe/look niet en volgt geen glass-look', () => {
    expect(floatTsx).toContain('dataset.axeNotch');
    expect(floatTsx).not.toContain('useSharedLookSync');
    expect(floatTsx).not.toMatch(/invoke\([^)]*zet_plaat_materiaal/);
    expect(floatTsx).not.toContain('applyStoredLookEarly');
    expect(floatTsx).not.toContain("relativePath: 'look'");
    expect(floatTsx).not.toContain('get_axe_look');
  });

  it('notch-webview roept geen native glas aan (main blijft look-eigenaar)', () => {
    expect(useLook).toContain('isAxeNotchWebview');
    expect(useLook).toContain('#/float/axe');
    expect(useLook).toMatch(/if \(isAxeNotchWebview\(\)\) return;/);
  });

  it('HQ schrijft ~/.axe/look alleen vanuit het main-venster', () => {
    expect(rust).toContain('fn get_axe_look');
    expect(rust).toContain('window.label() != "main"');
    expect(rust).toContain('macos_notch_window_shape');
    expect(rust).toContain('setHasShadow: NO');
  });

  it('zwevend AXE-venster heeft geen OS-schaduw', () => {
    expect(zweef).toContain("shadow: type !== 'axe'");
  });
});
