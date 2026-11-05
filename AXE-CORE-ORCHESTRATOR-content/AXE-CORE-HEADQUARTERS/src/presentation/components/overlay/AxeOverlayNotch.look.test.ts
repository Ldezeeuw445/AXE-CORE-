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

describe('AxeOverlayNotch look sync', () => {
  it('black en glass zetten zichtbaar andere notch-chrome', () => {
    expect(css).toContain(":root[data-look='black'] .axe-ov");
    expect(css).toContain(":root[data-look='glass'] .axe-ov");
    const glassBlok = css.slice(css.indexOf(":root[data-look='glass'] .axe-ov"));
    expect(glassBlok).toContain('rgba(248, 250, 253');
    expect(glassBlok).toContain('#1b2432');
    const blackBlok = css.slice(
      css.indexOf(":root[data-look='black'] .axe-ov"),
      css.indexOf(":root[data-look='glass'] .axe-ov"),
    );
    expect(blackBlok).toContain('#07090e');
    expect(blackBlok).not.toContain('rgba(248, 250, 253');
    // Default zonder data-look is al sterrenchroom, niet glass.
    const kop = css.slice(0, css.indexOf('LOOK_SYNC_VARIANTS'));
    expect(kop).toContain('#07090e');
    expect(kop).not.toContain('rgba(248, 250, 253');
  });

  it('clip-path maskeert de afgeronde onderhoeken (geen OS-rechthoek-streepjes)', () => {
    expect(css).toContain('html[data-axe-notch]');
    expect(css).toMatch(/clip-path:\s*inset\(0 round 0 0/);
    expect(css).toContain('box-shadow: 0 1px 0 rgba(255, 255, 255, 0.08) inset');
    expect(css).not.toMatch(/\.axe-ov \{[^}]*0 16px 40px rgba\(0, 0, 0/);
  });

  it('FloatAxe leest ~/.axe/look via get_axe_look en schrijft hem niet', () => {
    expect(floatTsx).toContain('useSharedLookSync');
    expect(floatTsx).toContain('get_axe_look');
    expect(floatTsx).toContain('axe-look');
    expect(floatTsx).toContain('dataset.look');
    expect(floatTsx).toContain('dataset.axeNotch');
    expect(floatTsx).not.toMatch(/invoke\([^)]*zet_plaat_materiaal/);
    expect(floatTsx).not.toContain('applyStoredLookEarly');
    expect(floatTsx).not.toContain("relativePath: 'look'");
  });

  it('notch-webview past DEFAULT glass niet toe en roept geen native glas aan', () => {
    expect(useLook).toContain('isAxeNotchWebview');
    expect(useLook).toContain('#/float/axe');
    expect(useLook).toMatch(/if \(isAxeNotchWebview\(\)\) return;/);
  });

  it('HQ schrijft ~/.axe/look alleen vanuit het main-venster en emit axe-look', () => {
    expect(rust).toContain('fn get_axe_look');
    expect(rust).toContain('window.label() != "main"');
    expect(rust).toContain('emit("axe-look"');
    expect(rust).toContain('macos_notch_window_shape');
    expect(rust).toContain('setHasShadow: NO');
  });

  it('zwevend AXE-venster heeft geen OS-schaduw', () => {
    expect(zweef).toContain("shadow: type !== 'axe'");
  });
});
