/**
 * SphereStage — Living Display on Home.
 * Sphere never unmounts and never navigates away.
 * Content emerges FROM the sphere as a circular hologram portal
 * (map / file / chart / code) — not a separate page or big dock box.
 */
import { useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X } from 'lucide-react';
import { HolographicSphere, type CoreStatus } from '@/presentation/components/axe-core/HolographicSphere';
import { useSphereProjectionStore } from '@/presentation/store/sphereProjectionStore';
import { DocumentProjection } from '@/presentation/components/axe-core/sphere/projections/DocumentProjection';
import { ImageProjection } from '@/presentation/components/axe-core/sphere/projections/ImageProjection';
import { ChartProjection } from '@/presentation/components/axe-core/sphere/projections/ChartProjection';
import { MapProjection } from '@/presentation/components/axe-core/sphere/projections/MapProjection';
import { CodeProjection } from '@/presentation/components/axe-core/sphere/projections/CodeProjection';
import { subscribeAxeEvent } from '@/infrastructure/events/eventBus';
import { moodForMode, type ProjectionMode, type ProjectionPayload } from '@/domain/sphere/projectionTypes';

const MODE_BORDER: Record<ProjectionMode, string> = {
  none: 'rgba(34,211,238,0.35)',
  document: 'rgba(34,211,238,0.4)',
  code: 'rgba(34,211,238,0.5)',
  image: 'rgba(165,243,252,0.42)',
  media: 'rgba(165,243,252,0.42)',
  chart: 'rgba(212,252,52,0.5)',
  map: 'rgba(167,139,250,0.55)',
};

const MODE_GLOW: Record<ProjectionMode, string> = {
  none: 'rgba(34,211,238,0.14)',
  document: 'rgba(34,211,238,0.16)',
  code: 'rgba(34,211,238,0.2)',
  image: 'rgba(165,243,252,0.16)',
  media: 'rgba(165,243,252,0.16)',
  chart: 'rgba(212,252,52,0.2)',
  map: 'rgba(167,139,250,0.22)',
};

const MODE_MORPH: Record<ProjectionMode, string> = {
  none: 'sphere',
  document: 'sphere',
  code: 'cube',
  image: 'torus',
  media: 'torus',
  chart: 'saturn',
  map: 'galaxy',
};

const EASE_EMERGE = [0.16, 1, 0.3, 1] as const;

export function SphereStage({ status }: { status: CoreStatus }) {
  const phase = useSphereProjectionStore(s => s.phase);
  const payload = useSphereProjectionStore(s => s.payload);
  const queue = useSphereProjectionStore(s => s.queue);
  const dismiss = useSphereProjectionStore(s => s.dismiss);
  const dismissAll = useSphereProjectionStore(s => s.dismissAll);
  const focus = useSphereProjectionStore(s => s.focus);
  const project = useSphereProjectionStore(s => s.project);
  const markProjecting = useSphereProjectionStore(s => s.markProjecting);

  const projecting = phase === 'opening' || phase === 'projecting' || phase === 'closing';
  const mode = payload?.mode ?? 'none';
  const mood = useMemo(() => moodForMode(mode), [mode]);

  useEffect(() => {
    const unsub1 = subscribeAxeEvent('axe:sphere-project', (p: ProjectionPayload) => {
      const cur = useSphereProjectionStore.getState();
      if (cur.payload?.id === p.id && (cur.phase === 'opening' || cur.phase === 'projecting')) {
        return;
      }
      project(p);
    });
    const unsub2 = subscribeAxeEvent('axe:sphere-dismiss', () => dismiss());
    return () => { unsub1(); unsub2(); };
  }, [project, dismiss]);

  useEffect(() => {
    if (phase !== 'opening') return;
    const t = setTimeout(() => markProjecting(), 380);
    return () => clearTimeout(t);
  }, [phase, markProjecting]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && projecting) dismiss();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [projecting, dismiss]);

  useEffect(() => {
    if (phase === 'idle' || phase === 'closing') {
      window.dispatchEvent(new CustomEvent('axe-sphere-morph', { detail: { key: 'sphere' } }));
      return;
    }
    if (!payload) return;
    window.dispatchEvent(
      new CustomEvent('axe-sphere-morph', { detail: { key: MODE_MORPH[mode] || 'sphere' } }),
    );
  }, [payload?.id, mode, phase]); // eslint-disable-line react-hooks/exhaustive-deps

  // Sphere stays primary — soft breath, never replaced by another page
  const sphereOpacity =
    phase === 'opening' ? 0.85
      : phase === 'projecting' ? 0.7
        : phase === 'closing' ? 0.9
          : 1;

  const sphereScale =
    phase === 'opening' ? 1.08
      : phase === 'projecting' ? 1.04
        : phase === 'closing' ? 1.02
          : 1;

  const showPortal = !!payload && phase !== 'idle';

  return (
    <div className="absolute inset-0 overflow-hidden">
      <motion.div
        className="absolute inset-0"
        animate={{
          opacity: sphereOpacity,
          scale: sphereScale,
          filter:
            phase === 'opening'
              ? 'brightness(1.25) saturate(1.2)'
              : phase === 'projecting'
                ? 'brightness(1.1) saturate(1.12)'
                : 'none',
        }}
        transition={{ duration: 0.55, ease: EASE_EMERGE }}
      >
        <HolographicSphere status={status} />
      </motion.div>

      {/* Emergence bloom around core */}
      <AnimatePresence>
        {(phase === 'opening' || phase === 'closing') && (
          <motion.div
            key="bloom"
            className="absolute inset-0 pointer-events-none z-[5]"
            initial={{ opacity: 0 }}
            animate={{ opacity: phase === 'opening' ? 1 : 0.4 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.35 }}
          >
            <div
              className="absolute left-1/2 top-[44%] -translate-x-1/2 -translate-y-1/2 w-[min(58vw,340px)] h-[min(58vw,340px)] rounded-full"
              style={{
                background: `radial-gradient(circle, ${MODE_GLOW[mode]} 0%, transparent 64%)`,
                boxShadow: `0 0 100px ${MODE_GLOW[mode]}`,
              }}
            />
          </motion.div>
        )}
      </AnimatePresence>

      {phase === 'projecting' && (
        <div
          className="absolute inset-0 pointer-events-none z-[4]"
          style={{
            background:
              mood.accent === 'gold'
                ? 'radial-gradient(ellipse at 50% 44%, rgba(212,252,52,0.07), transparent 52%)'
                : mood.accent === 'violet'
                  ? 'radial-gradient(ellipse at 50% 44%, rgba(167,139,250,0.09), transparent 52%)'
                  : 'radial-gradient(ellipse at 50% 44%, rgba(34,211,238,0.06), transparent 52%)',
          }}
        />
      )}

      {/* Queue — minimal chips above portal */}
      {queue.length > 1 && phase !== 'idle' && (
        <div className="absolute top-14 left-1/2 -translate-x-1/2 z-30 flex items-center gap-1.5 pointer-events-auto">
          {queue.map(q => {
            const active = q.id === payload?.id;
            return (
              <button
                key={q.id}
                type="button"
                onClick={() => focus(q.id)}
                className="rounded-full px-2.5 py-1 text-[9px] font-medium truncate max-w-[110px]"
                style={{
                  background: active ? 'rgba(34,211,238,0.2)' : 'rgba(0,0,0,0.5)',
                  border: `1px solid ${active ? MODE_BORDER[q.mode] : 'rgba(255,255,255,0.1)'}`,
                  color: active ? '#a5f3fc' : 'rgba(255,255,255,0.4)',
                  backdropFilter: 'blur(8px)',
                }}
                title={q.title}
              >
                {q.mode} · {q.title}
              </button>
            );
          })}
          <button
            type="button"
            onClick={() => dismissAll()}
            className="rounded-full px-2 py-1 text-[9px]"
            style={{ color: 'rgba(255,255,255,0.35)', border: '1px solid rgba(255,255,255,0.08)' }}
          >
            clear
          </button>
        </div>
      )}

      {/*
        Hologram portal — circular aperture centered on the sphere.
        Content feels projected FROM the core, not a separate UI panel.
      */}
      <AnimatePresence mode="wait">
        {showPortal && payload && (
          <motion.div
            key={payload.id}
            className="absolute inset-0 z-20 flex items-center justify-center pointer-events-none"
            initial={{ opacity: 0 }}
            animate={{ opacity: phase === 'closing' ? 0 : 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.35 }}
          >
            <motion.div
              className="relative pointer-events-auto flex flex-col items-center"
              initial={{ opacity: 0, scale: 0.35 }}
              animate={{
                opacity: phase === 'closing' ? 0 : 1,
                scale: phase === 'closing' ? 0.4 : 1,
              }}
              exit={{ opacity: 0, scale: 0.35 }}
              transition={{ duration: 0.5, ease: EASE_EMERGE }}
            >
              {/* Outer orbital rings */}
              <div
                className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full pointer-events-none"
                style={{
                  width: 'min(72vmin, 360px)',
                  height: 'min(72vmin, 360px)',
                  border: `1px solid ${MODE_BORDER[mode]}`,
                  opacity: 0.35,
                  boxShadow: `0 0 40px ${MODE_GLOW[mode]}`,
                }}
              />
              <div
                className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full pointer-events-none"
                style={{
                  width: 'min(78vmin, 390px)',
                  height: 'min(78vmin, 390px)',
                  border: `1px dashed ${MODE_BORDER[mode]}`,
                  opacity: 0.18,
                }}
              />

              {/* Circular hologram aperture */}
              <div
                className="relative overflow-hidden flex flex-col"
                style={{
                  width: 'min(58vmin, 300px)',
                  height: 'min(58vmin, 300px)',
                  borderRadius: '50%',
                  background: 'rgba(0,0,0,0.78)',
                  border: `1.5px solid ${MODE_BORDER[mode]}`,
                  boxShadow: `
                    0 0 0 1px rgba(0,0,0,0.4),
                    0 0 48px ${MODE_GLOW[mode]},
                    inset 0 0 40px ${MODE_GLOW[mode]}
                  `,
                  backdropFilter: 'blur(12px)',
                }}
              >
                {/* Scanline / hologram sheen */}
                <div
                  className="absolute inset-0 pointer-events-none z-[2]"
                  style={{
                    background:
                      'repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(255,255,255,0.015) 2px, rgba(255,255,255,0.015) 4px)',
                    borderRadius: '50%',
                  }}
                />
                <div
                  className="absolute inset-0 pointer-events-none z-[2]"
                  style={{
                    background:
                      `radial-gradient(circle at 50% 30%, ${MODE_GLOW[mode]}, transparent 55%)`,
                    borderRadius: '50%',
                  }}
                />

                <button
                  type="button"
                  onClick={() => dismiss()}
                  className="absolute top-3 right-[18%] z-10 rounded-full p-1"
                  style={{
                    background: 'rgba(0,0,0,0.45)',
                    color: 'rgba(255,255,255,0.5)',
                    border: '1px solid rgba(255,255,255,0.1)',
                  }}
                  title="Return to sphere (Esc)"
                >
                  <X size={11} />
                </button>

                <div
                  className="relative flex-1 min-h-0 z-[1]"
                  style={{
                    // Soft mask so content stays inside the circle
                    maskImage: 'radial-gradient(circle at center, black 62%, transparent 98%)',
                    WebkitMaskImage: 'radial-gradient(circle at center, black 62%, transparent 98%)',
                  }}
                >
                  {payload.mode === 'document' && <DocumentProjection payload={payload} />}
                  {payload.mode === 'code' && <CodeProjection payload={payload} />}
                  {payload.mode === 'image' && <ImageProjection payload={payload} />}
                  {payload.mode === 'media' && <ImageProjection payload={payload} />}
                  {payload.mode === 'chart' && <ChartProjection payload={payload} />}
                  {payload.mode === 'map' && <MapProjection payload={payload} />}
                </div>
              </div>

              {/* Caption under portal — still Home, still sphere */}
              <div
                className="mt-3 px-3 py-1 rounded-full text-[8px] tracking-[0.14em] uppercase"
                style={{
                  color: 'rgba(255,255,255,0.4)',
                  background: 'rgba(0,0,0,0.45)',
                  border: `1px solid ${MODE_BORDER[mode]}`,
                  backdropFilter: 'blur(8px)',
                }}
              >
                {mode} · {payload.title} · esc
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
