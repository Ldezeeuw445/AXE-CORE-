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
    // Eén vaste stand. 5 nov: doorzichtig glas. 27 nov (Luka): "geowoon de
    // stijl van de cards van axe core inplaats van doorzichtig" -- dus het
    // mat-zwarte kaartmateriaal van --axe-card-bg (#171717 → #0C0C0C), dicht.
    // Meeschakelen met data-look mag nog steeds niet; dat staat hieronder.
    expect(surface).toMatch(/--axe-card-bg:\s*linear-gradient\(180deg,\s*rgba\(23,\s*23,\s*23/);
    expect(css).toMatch(/--axe-notch-shell:\s*linear-gradient\(180deg,\s*#171717[^;]*#0C0C0C/);
    expect(css).toContain('background: var(--axe-notch-shell)');
    expect(css).toContain('NOTCH_SHELL_FIXED');
    expect(css).not.toContain(":root[data-look='glass'] .axe-ov");
    expect(css).not.toContain(":root[data-look='black'] .axe-ov");
    expect(css).not.toContain('rgba(248, 250, 253');
  });

  it('mat en dicht: geen doorzichtige schil en geen glas erachter (Luka 27 nov)', () => {
    // Geen rgba-dekking op de schil en geen backdrop-filter op .axe-ov of het
    // handvat: dan schemert het bureaublad niet door en rekent macOS geen
    // blur per frame (18 nov: ~67% CPU voor WindowServer en WebKit-GPU).
    expect(css).not.toMatch(/--axe-notch-shell:\s*rgba\(/);
    expect(css).not.toMatch(/\.axe-ov \{[^}]*backdrop-filter/s);
    expect(css).not.toMatch(/\.axe-ov__handvat \{[^}]*backdrop-filter/s);
  });

  it('knoppen hebben vaste vulling en cyaan-accent bij hover/pressed', () => {
    expect(css).toContain('--axe-notch-btn: #111111');
    expect(css).toContain('--axe-notch-accent: #22D3EE');
    expect(css).toMatch(/\.axe-ov__ico:hover\s*\{[^}]*var\(--axe-notch-accent\)/s);
    // Ronde 5 (22 nov): actieve tab is een zachte grijze pil (Luka's foto's);
    // de luisterende microfoon blijft vol cyaan.
    expect(css).toMatch(/\.axe-ov__ico--hot\s*\{[^}]*background:\s*var\(--axe-notch-accent\)/s);
    expect(css).toMatch(/\.axe-ov__ico\[aria-pressed="true"\]\s*\{[^}]*background:\s*rgba\(255, 255, 255/s);
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
