import { describe, expect, it } from 'vitest';
import { podiumKrachtVan, webglBeschikbaar } from './podiumKracht';

describe('podiumKrachtVan', () => {
  it('plat bij reduced-motion, ook op een sterke machine', () => {
    expect(podiumKrachtVan({ reducedMotion: true, webgl: true, cores: 16, geheugenGb: 32 })).toBe('plat');
  });

  it('plat zonder webgl', () => {
    expect(podiumKrachtVan({ reducedMotion: false, webgl: false, cores: 8 })).toBe('plat');
  });

  it('licht op een zwakke GPU (weinig cores of geheugen)', () => {
    expect(podiumKrachtVan({ reducedMotion: false, webgl: true, cores: 2 })).toBe('licht');
    expect(podiumKrachtVan({ reducedMotion: false, webgl: true, cores: 8, geheugenGb: 2 })).toBe('licht');
  });

  it('vol als er ruimte is', () => {
    expect(podiumKrachtVan({ reducedMotion: false, webgl: true, cores: 8, geheugenGb: 16 })).toBe('vol');
  });
});

describe('webglBeschikbaar', () => {
  it('false zonder context, true als webgl2 antwoordt', () => {
    expect(webglBeschikbaar()).toBe(false);
    expect(webglBeschikbaar(() => { throw new Error('nope'); })).toBe(false);
    expect(webglBeschikbaar((type) => (type === 'webgl2' ? {} : null))).toBe(true);
  });
});
