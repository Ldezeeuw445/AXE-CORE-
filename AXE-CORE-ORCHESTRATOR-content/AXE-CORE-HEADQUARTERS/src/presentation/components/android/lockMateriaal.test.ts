import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { lockMateriaal } from '@/presentation/components/android/lockMateriaal';

const css = readFileSync(new URL('../../../design/axe-look.css', import.meta.url), 'utf8');

describe('lock-materiaal', () => {
  it('plaat-inkt: licht donker op grijs, zwart de gewone --ink', () => {
    const licht = lockMateriaal('glass');
    const zwart = lockMateriaal('black');
    expect(licht.tekst).toMatch(/18, 22, 28/);
    expect(licht.tekst).not.toMatch(/#fff|#ffffff/i);
    expect(zwart.tekst).toBe('var(--text-primary)');
    expect(zwart.gedempt).toBe('var(--text-muted)');
  });

  it('slotkaarten zijn --kaart, één keer, geen wit vlak', () => {
    const n = (css.match(/:root\[data-look\] \.axe-lock-kaart\s*\{/g) || []).length;
    expect(n).toBe(1);
    expect(css).toMatch(/\.axe-lock-kaart\s*\{[^}]*background:\s*var\(--kaart\)/s);
    expect(css).not.toMatch(/\.axe-lock-kaart\s*\{[^}]*#fff/s);
  });
});

