/**
 * SphereStage — Living Display on Home.
 * Sphere never unmounts and never navigates away.
 * Content emerges as a subtle glass layer over the sphere (not a separate page/tab).
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
  none: 'rgba(34,211,238,0.28)',
  document: 'rgba(34,211,238,0.32)',
  code: 'rgba(34,211,238,0.45)',
  image: 'rgba(165,243,252,0.38)',
  media: 'rgba(165,243,252,0.38)',
  chart: 'rgba(212,252,52,0.45)',
  map: 'rgba(167,139,250,0.5)',
};

const MODE_GLOW: Record<ProjectionMode, string> = {
  none: 'rgba(34,211,238,0.12)',
  document: 'rgba(34,211,238,0.14)',
  code: 'rgba(34,211,238,0.18)',
  image: 'rgba(165,243,252,0.14)',
  media: 'rgba(165,243,252,0.14)',
  chart: 'rgba(212,252,52,0.18)',
  map: 'rgba(167,139,250,0.2)',
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
    const t = setTimeout(() => markProjecting(), 420);
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

  // Keep the sphere alive and visible — only a soft dim, never hide it
  const sphereOpacity =
    phase === 'opening' ? 0.72
      : phase === 'projecting' ? 0.55
        : phase === 'closing' ? 0.85
          : 1;

  const sphereScale =
    phase === 'opening' ? 1.06
      : phase === 'projecting' ? 1.02
        : phase === 'closing' ? 1.03
          : 1;

  const showPanel = !!payload && phase !== 'idle';

  return (
    <div className="absolute inset-0 overflow-hidden">
      <motion.div
        className="absolute inset-0"
        animate={{
          opacity: sphereOpacity,
          scale: sphereScale,
          filter:
            phase === 'opening'
              ? 'brightness(1.2) saturate(1.15)'
              : phase === 'projecting'
                ? mood.energy === 'pulse'
                  ? 'brightness(1.08) saturate(1.12)'
                  : 'brightness(1.02) saturate(1.06)'
                : 'none',
        }}
        transition={{ duration: 0.55, ease: EASE_EMERGE }}
      >
        <HolographicSphere status={status} />
      </motion.div>

      <AnimatePresence>
        {(phase === 'opening' || phase === 'closing') && (
          <motion.div
            key="bloom"
            className="absolute inset-0 pointer-events-none z-[5]"
            initial={{ opacity: 0 }}
            animate={{ opacity: phase === 'opening' ? 0.85 : 0.35 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.35 }}
          >
            <div
              className="absolute left-1/2 top-[42%] -translate-x-1/2 -translate-y-1/2 w-[min(55vw,320px)] h-[min(55vw,320px)] rounded-full"
              style={{
                background: `radial-gradient(circle, ${MODE_GLOW[mode]} 0%, transparent 62%)`,
                boxShadow: `0 0 90px ${MODE_GLOW[mode]}`,
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
                ? 'radial-gradient(ellipse at 50% 45%, rgba(212,252,52,0.06), transparent 55%)'
                : mood.accent === 'violet'
                  ? 'radial-gradient(ellipse at 50% 45%, rgba(167,139,250,0.08), transparent 55%)'
                  : mood.accent === 'soft'
                    ? 'radial-gradient(ellipse at 50% 45%, rgba(165,243,252,0.06), transparent 55%)'
                    : 'radial-gradient(ellipse at 50% 45%, rgba(34,211,238,0.05), transparent 55%)',
          }}
        />
      )}

      {/* Queue chips — top center, minimal */}
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
                  background: active ? 'rgba(34,211,238,0.2)' : 'rgba(0,0,0,0.55)',
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
            title="Clear all"
          >
            clear
          </button>
        </div>
      )}

      {/* Living glass layer — bottom dock over sphere, not a full-page modal */}
      <AnimatePresence mode="wait">
        {showPanel && payload && (
          <motion.div
            key={payload.id}
            className="absolute inset-x-0 bottom-0 z-20 flex justify-center pointer-events-none px-3 pb-3 md:px-6 md:pb-4"
            initial={{ opacity: 0, y: 28 }}
            animate={{ opacity: phase === 'closing' ? 0 : 1, y: phase === 'closing' ? 20 : 0 }}
            exit={{ opacity: 0, y: 24 }}
            transition={{ duration: 0.4, ease: EASE_EMERGE }}
          >
            <motion.div
              className="relative w-full max-w-md md:max-w-lg rounded-2xl overflow-hidden pointer-events-auto flex flex-col"
              style={{
                height: 'min(38vh, 280px)',
                background: 'rgba(0,0,0,0.72)',
                border: `1px solid ${MODE_BORDER[mode]}`,
                boxShadow: `0 0 40px ${MODE_GLOW[mode]}, 0 12px 32px rgba(0,0,0,0.45)`,
                backdropFilter: 'blur(16px)',
              }}
              initial={{ opacity: 0, scale: 0.92, y: 16 }}
              animate={{
                opacity: phase === 'closing' ? 0 : 1,
                scale: phase === 'closing' ? 0.94 : 1,
                y: phase === 'closing' ? 12 : 0,
              }}
              exit={{ opacity: 0, scale: 0.94, y: 16 }}
              transition={{ duration: 0.42, ease: EASE_EMERGE }}
            >
              <div
                className="absolute top-0 left-1/2 -translate-x-1/2 h-[1px] w-[36%] z-20"
                style={{
                  background: `linear-gradient(90deg, transparent, ${MODE_BORDER[mode]}, transparent)`,
                  boxShadow: `0 0 12px ${MODE_GLOW[mode]}`,
                }}
              />

              <div className="absolute top-1.5 right-1.5 z-10">
                <button
                  type="button"
                  onClick={() => dismiss()}
                  className="rounded-full p-1"
                  style={{
                    background: 'rgba(255,255,255,0.05)',
                    color: 'rgba(255,255,255,0.45)',
                    border: '1px solid rgba(255,255,255,0.08)',
                  }}
                  title="Return to sphere (Esc)"
                >
                  <X size={12} />
                </button>
              </div>

              <div className="relative flex-1 min-h-0 pt-1">
                {payload.mode === 'document' && <DocumentProjection payload={payload} />}
                {payload.mode === 'code' && <CodeProjection payload={payload} />}
                {payload.mode === 'image' && <ImageProjection payload={payload} />}
                {payload.mode === 'media' && <ImageProjection payload={payload} />}
                {payload.mode === 'chart' && <ChartProjection payload={payload} />}
                {payload.mode === 'map' && <MapProjection payload={payload} />}
              </div>

              <div
                className="flex-shrink-0 px-3 py-1 text-[7px] tracking-[0.12em] uppercase text-center"
                style={{ color: 'rgba(255,255,255,0.2)', borderTop: '1px solid rgba(255,255,255,0.05)' }}
              >
                living · {mode} · {payload.title} · esc
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
