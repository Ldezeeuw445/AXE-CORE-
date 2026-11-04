import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const css = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), 'AxeOverlayNotch.css'),
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
  });

  it('FloatAxe pollt ~/.axe/look en past data-look toe', () => {
    const tsx = readFileSync(
      join(dirname(fileURLToPath(import.meta.url)), '../../pages/FloatAxe.tsx'),
      'utf8',
    );
    expect(tsx).toContain('useSharedLookSync');
    expect(tsx).toContain("relativePath: 'look'");
    expect(tsx).toContain('dataset.look');
  });
});
