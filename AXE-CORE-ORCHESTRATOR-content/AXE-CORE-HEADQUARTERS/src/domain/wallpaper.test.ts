import { describe, it, expect } from 'vitest';
import {
  WALLPAPER_PRESETS, nightPeaksCss, parseWallpaper, serializeWallpaper, wallpaperCss,
  parseTuning, DEFAULT_TUNING, fitWithin,
} from './wallpaper';

describe('parseWallpaper', () => {
  it('never chosen is the plain AXE CORE plate; a wallpaper is never the default', () => {
    expect(parseWallpaper(null)).toEqual({ kind: 'none' });
    expect(parseWallpaper(undefined)).toEqual({ kind: 'none' });
    expect(parseWallpaper('')).toEqual({ kind: 'none' });
  });

  it('finds a preset by id', () => {
    const w = parseWallpaper('preset:aurora');
    expect(w.kind).toBe('preset');
    if (w.kind === 'preset') expect(w.preset.id).toBe('aurora');
  });

  it('an unknown preset is none, not a crash and not a half-set state', () => {
    expect(parseWallpaper('preset:does-not-exist')).toEqual({ kind: 'none' });
  });

  it('keeps a photo stored by the first version (a bare data URL)', () => {
    const url = 'data:image/jpeg;base64,/9j/4AAQ';
    expect(parseWallpaper(url)).toEqual({ kind: 'photo', dataUrl: url });
  });

  it('refuses things that are not images, so nothing is ever injected into the css url()', () => {
    expect(parseWallpaper('data:text/html;base64,PHNjcmlwdD4=')).toEqual({ kind: 'none' });
    expect(parseWallpaper('https://evil.example/x.png')).toEqual({ kind: 'none' });
    expect(parseWallpaper('javascript:alert(1)')).toEqual({ kind: 'none' });
    expect(parseWallpaper('data:image/svg+xml;base64,PHN2Zz4=')).toEqual({ kind: 'none' });
  });
});

describe('serialize round trip', () => {
  it('survives for every kind', () => {
    for (const p of WALLPAPER_PRESETS) {
      const w = parseWallpaper('preset:' + p.id);
      expect(parseWallpaper(serializeWallpaper(w))).toEqual(w);
    }
    const photo = parseWallpaper('data:image/png;base64,iVBOR');
    expect(parseWallpaper(serializeWallpaper(photo))).toEqual(photo);
    expect(serializeWallpaper({ kind: 'none' })).toBe('');
  });
});

describe('wallpaperCss', () => {
  it('has nothing for none', () => {
    expect(wallpaperCss({ kind: 'none' })).toBeNull();
  });
  it('wraps a photo in url() cover', () => {
    const css = wallpaperCss({ kind: 'photo', dataUrl: 'data:image/png;base64,AA' });
    expect(css).toContain('url("data:image/png;base64,AA")');
    expect(css).toContain('cover');
  });
  it('the night peaks is a real picture: svg data, stars and three ridges', () => {
    const p = WALLPAPER_PRESETS.find(x => x.id === 'peaks')!;
    const svg = decodeURIComponent(p.css.match(/data:image\/svg\+xml,([^"]+)/)![1]);
    expect(svg).toContain('<svg');
    expect((svg.match(/<circle/g) ?? []).length).toBe(90);
    expect((svg.match(/<polygon/g) ?? []).length).toBe(3);
    expect(p.css).toContain('cover');
  });
  it('the night peaks are identical on every call (seeded sky)', () => {
    expect(nightPeaksCss()).toBe(nightPeaksCss());
  });
  it('every preset has a css value', () => {
    for (const p of WALLPAPER_PRESETS) expect(p.css.length).toBeGreaterThan(20);
  });
  it('preset ids are unique', () => {
    expect(new Set(WALLPAPER_PRESETS.map(p => p.id)).size).toBe(WALLPAPER_PRESETS.length);
  });
});

describe('parseTuning', () => {
  it('falls back to the default for nothing and for garbage', () => {
    expect(parseTuning(null, null)).toEqual(DEFAULT_TUNING);
    expect(parseTuning('abc', '')).toEqual(DEFAULT_TUNING);
  });
  it('zero is a real value, not "missing"', () => {
    expect(parseTuning('0', '0')).toEqual({ dim: 0, blur: 0 });
  });
  it('clamps both ends', () => {
    expect(parseTuning('5', '500')).toEqual({ dim: 0.85, blur: 80 });
    expect(parseTuning('-1', '-9')).toEqual({ dim: 0, blur: 0 });
  });
});

describe('fitWithin', () => {
  it('shrinks a big photo to the long edge, keeping the aspect', () => {
    expect(fitWithin(4000, 3000)).toEqual({ width: 1440, height: 1080 });
    expect(fitWithin(3000, 4000)).toEqual({ width: 1080, height: 1440 });
  });
  it('never enlarges a small one', () => {
    expect(fitWithin(800, 600)).toEqual({ width: 800, height: 600 });
  });
});
