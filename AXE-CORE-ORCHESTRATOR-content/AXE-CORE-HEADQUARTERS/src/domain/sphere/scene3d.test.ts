import { describe, expect, it } from 'vitest';
import { isSplineUrl, splineVorm } from './scene3d';

describe('scene3d: alleen Spline-scènes in het vak', () => {
  it('laat gepubliceerde Spline-adressen toe', () => {
    expect(isSplineUrl('https://my.spline.design/axecorecore-abc123/')).toBe(true);
    expect(isSplineUrl('https://prod.spline.design/Ab12Cd34/scene.splinecode')).toBe(true);
    expect(splineVorm('https://prod.spline.design/Ab12Cd34/scene.splinecode')).toBe('scene');
    expect(splineVorm('https://my.spline.design/x-1/')).toBe('pagina');
  });

  it('weigert al het andere', () => {
    for (const u of ['http://my.spline.design/x/', 'https://evil.com/my.spline.design/x', 'https://my.spline.design.evil.com/x', 'javascript:alert(1)', 42, null]) {
      expect(isSplineUrl(u), String(u)).toBe(false);
    }
  });
});

describe('AXE kondigt een 3D-scène aan', () => {
  it('[PROJECT: scene3d] met een Spline-adres wordt een projectie, zonder niet', async () => {
    const { parseProjectMarker } = await import('@/application/sphere/sphereDirector');
    const p = parseProjectMarker('Hier: [PROJECT: {"mode":"scene3d","title":"AXE core","url":"https://my.spline.design/axe-core-1/"}]');
    expect(p).toMatchObject({ mode: 'scene3d', mediaUrl: 'https://my.spline.design/axe-core-1/' });
    expect(parseProjectMarker('[PROJECT: {"mode":"scene3d","url":"https://evil.com/x"}]')).toBeNull();
    const { soortVanMode, podiumMaatVoor } = await import('./podium');
    expect(podiumMaatVoor(soortVanMode('scene3d'))).toBe('vol');
  });
});
