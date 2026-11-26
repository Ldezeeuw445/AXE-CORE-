/**
 * Een Spline-scène groot in het vak (26 nov). Alleen gepubliceerde Spline-adressen
 * (domain/sphere/scene3d.ts).
 *
 * Eerst in een afgeschermd frame: dat bleef zwart, want Spline's viewer heeft
 * IndexedDB/localStorage nodig en die bestaan niet in een frame zonder eigen
 * origin. Nu Spline's officiële <spline-viewer> direct in de app; het script
 * komt pas binnen als er echt een scène getoond wordt. Een my.spline.design-
 * pagina blijft een frame (die heeft zijn eigen origin).
 */
import { createElement, useEffect, useState } from 'react';
import type { ProjectionPayload } from '@/domain/sphere/projectionTypes';
import { isSplineUrl, splineVorm } from '@/domain/sphere/scene3d';

const VIEWER = 'https://unpkg.com/@splinetool/viewer@1.10.57/build/spline-viewer.js';
let laden: Promise<void> | null = null;

function laadViewer(): Promise<void> {
  if (customElements.get('spline-viewer')) return Promise.resolve();
  if (!laden) {
    laden = new Promise((klaar, fout) => {
      const s = document.createElement('script');
      s.type = 'module';
      s.src = VIEWER;
      s.onload = () => customElements.whenDefined('spline-viewer').then(() => klaar());
      s.onerror = () => { laden = null; fout(new Error('Spline viewer did not load')); };
      document.head.appendChild(s);
    });
  }
  return laden;
}

function Leeg({ tekst }: { tekst: string }) {
  return (
    <div className="h-full flex items-center justify-center text-[12px] px-6" style={{ color: 'var(--text-muted)' }}>
      {tekst}
    </div>
  );
}

export function Scene3dProjection({ payload }: { payload: ProjectionPayload }) {
  const url = payload.mediaUrl;
  const geldig = isSplineUrl(url);
  const scene = geldig && splineVorm(url) === 'scene';
  const [stand, setStand] = useState<'laden' | 'klaar' | 'fout'>('laden');

  useEffect(() => {
    if (!scene) return;
    let levend = true;
    laadViewer().then(() => levend && setStand('klaar'), () => levend && setStand('fout'));
    return () => { levend = false; };
  }, [scene]);

  if (!geldig) return <Leeg tekst="This 3D scene has no published Spline address." />;
  if (!scene) {
    return <iframe title={payload.title} src={url} sandbox="allow-scripts allow-same-origin" className="absolute inset-0 h-full w-full border-0" style={{ background: '#0a0a0b' }} data-axe-scene3d />;
  }
  if (stand === 'fout') return <Leeg tekst="The Spline viewer did not load. Check the connection and try again." />;
  if (stand === 'laden') return <Leeg tekst="Loading the 3D scene…" />;
  return (
    <div className="absolute inset-0" style={{ background: '#0a0a0b' }} data-axe-scene3d>
      {createElement('spline-viewer', { url, style: { width: '100%', height: '100%', display: 'block' } })}
    </div>
  );
}
