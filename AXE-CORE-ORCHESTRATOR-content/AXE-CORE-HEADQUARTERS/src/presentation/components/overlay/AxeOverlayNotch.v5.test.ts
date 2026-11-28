import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const hier = resolve(__dirname);
const lees = (p: string) => readFileSync(resolve(hier, p), 'utf8');
const css = lees('AxeOverlayNotch.css');
const tsx = lees('AxeOverlayNotch.tsx');
const stof = lees('NotchStof.tsx');
const gezichtCss = lees('../axe-core/AxeGezicht.css');
const gezicht = lees('../axe-core/AxeGezicht.tsx');

describe('notch v5 (Luka 27 nov t78u: realistischer, echt premium)', () => {
  it('veren via linear(), met een terugval voor oudere WebKit', () => {
    expect(gezichtCss).toMatch(/@supports \(transition-timing-function: linear\(0, 1\)\)/);
    expect(gezichtCss).toMatch(/--axe-veer: linear\(/);
    expect(css).toMatch(/axe-ov-compact-in 0\.\d+s var\(--axe-veer\)/);
  });

  it('knipperen en kijken met spreiding, geen vaste CSS-loop meer', () => {
    expect(gezichtCss).not.toMatch(/@keyframes axe-knipper/);
    expect(gezichtCss).not.toMatch(/@keyframes axe-rondkijk/);
    expect(gezicht).toMatch(/volgendeKnipper\(/);
    expect(gezichtCss).toMatch(/\[data-knip\]/);
  });

  it('stof is een canvas, geen geanimeerde background-position (paint per frame)', () => {
    expect(css).not.toMatch(/@keyframes axe-stof/);
    expect(tsx).not.toContain('axe-ov__stof ');
    expect(tsx).toContain('<NotchStof');
    expect(stof).toMatch(/requestAnimationFrame/);
    expect(stof).toMatch(/document\.hidden/);
    expect(stof).toMatch(/cancelAnimationFrame/);
  });

  it('minder beweging: geen stof, geen klokjes, alles stil', () => {
    expect(stof).toMatch(/prefers-reduced-motion: reduce/);
    expect(gezicht).toMatch(/prefers-reduced-motion: reduce/);
    expect(gezichtCss).toMatch(/@media \(prefers-reduced-motion: reduce\)[\s\S]*axe-gezicht__ogen[\s\S]*animation: none !important/);
    expect(css).toMatch(/@media \(prefers-reduced-motion: reduce\) \{\n {2}\.axe-ov__compact, \.axe-ov__body/);
  });

  it('overvloeien: kaart en woord krijgen een key, de gloed-kleur is een @property', () => {
    expect(tsx).toMatch(/key=\{stand\}/);
    expect(tsx).toMatch(/key=\{leven\.toestand\}/);
    expect(css).toMatch(/@property --gloed/);
  });

  it('de lichtstreep blijft heel zwak (≤ 3% wit), korrel tegen banding', () => {
    const glans = css.match(/c-kaart::after,[\s\S]*?\}/)![0];
    const alfas = [...glans.matchAll(/rgba\(255, 255, 255, ([\d.]+)\)/g)].map((m) => Number(m[1]));
    expect(Math.max(...alfas)).toBeLessThanOrEqual(0.03);
    expect(css).toMatch(/feTurbulence/);
  });
});
