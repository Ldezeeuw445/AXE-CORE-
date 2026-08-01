/**
 * SphereStage — Living Display shell.
 * Sphere never unmounts. Content emerges from / returns to the sphere.
 * Presentation only renders store payload.
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
import { moodForMode, type ProjectionMode } from '@/domain/sphere/projectionTypes';

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
    const unsub1 = subscribeAxeEvent('axe:sphere-project', (p) => project(p));
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

  // Morph sphere to mode shape while projecting; return to idle sphere on close
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

  const sphereOpacity =
    phase === 'opening' ? 0.22
      : phase === 'projecting' ? 0.18
        : phase === 'closing' ? 0.55
          : 1;

  const sphereScale =
    phase === 'opening' ? 1.14
      : phase === 'projecting' ? 0.92
        : phase === 'closing' ? 1.06
          : 1;

  return (
    <div className="absolute inset-0 overflow-hidden">
      {/* Living sphere — never unmounts */}
      <motion.div
        className="absolute inset-0"
        animate={{
          opacity: sphereOpacity,
          scale: sphereScale,
          filter:
            phase === 'opening'
              ? 'brightness(1.35) saturate(1.25)'
              : phase === 'projecting'
                ? mood.energy === 'pulse'
                  ? 'brightness(1.1) saturate(1.15)'
                  : 'brightness(0.95) saturate(1.05)'
                : 'none',
        }}
        transition={{ duration: 0.55, ease: EASE_EMERGE }}
      >
        <HolographicSphere status={status} />
      </motion.div>

      {/* Emergence bloom from sphere core */}
      <AnimatePresence>
        {(phase === 'opening' || phase === 'closing') && (
          <motion.div
            key="bloom"
            className="absolute inset-0 pointer-events-none z-[5]"
            initial={{ opacity: 0 }}
            animate={{ opacity: phase === 'opening' ? 1 : 0.5 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.35 }}
          >
            <div
              className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-[min(70vw,420px)] h-[min(70vw,420px)] rounded-full"
              style={{
                background: `radial-gradient(circle, ${MODE_GLOW[mode]} 0%, transparent 62%)`,
                boxShadow: `0 0 120px ${MODE_GLOW[mode]}`,
              }}
            />
          </motion.div>
        )}
      </AnimatePresence>

      {/* Mood rim while projecting */}
      {phase === 'projecting' && (
        <div
          className="absolute inset-0 pointer-events-none z-[4]"
          style={{
            background:
              mood.accent === 'gold'
                ? 'radial-gradient(ellipse at 50% 60%, rgba(212,252,52,0.08), transparent 55%)'
                : mood.accent === 'violet'
                  ? 'radial-gradient(ellipse at 50% 60%, rgba(167,139,250,0.1), transparent 55%)'
                  : mood.accent === 'soft'
                    ? 'radial-gradient(ellipse at 50% 60%, rgba(165,243,252,0.08), transparent 55%)'
                    : 'radial-gradient(ellipse at 50% 60%, rgba(34,211,238,0.07), transparent 55%)',
          }}
        />
      )}

      {/* Queue dock */}
      {queue.length > 1 && phase !== 'idle' && (
        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-20 flex items-center gap-1.5 pointer-events-auto">
          {queue.map(q => {
            const active = q.id === payload?.id;
            return (
              <button
                key={q.id}
                type="button"
                onClick={() => focus(q.id)}
                className="rounded-full px-2.5 py-1 text-[9px] font-medium truncate max-w-[120px]"
                style={{
                  background: active ? 'rgba(34,211,238,0.22)' : 'rgba(0,0,0,0.75)',
                  border: `1px solid ${active ? MODE_BORDER[q.mode] : 'rgba(255,255,255,0.1)'}`,
                  color: active ? '#a5f3fc' : 'rgba(255,255,255,0.45)',
                  boxShadow: active ? `0 0 12px ${MODE_GLOW[q.mode]}` : 'none',
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

      <AnimatePresence mode="wait">
        {payload && phase !== 'idle' && (
          <motion.div
            key={payload.id}
            className="absolute inset-0 z-10 flex items-center justify-center p-4 md:p-8 pointer-events-none"
            initial={{ opacity: 0 }}
            animate={{ opacity: phase === 'closing' ? 0 : 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.32 }}
          >
            <motion.div
              className="relative w-full max-w-xl md:max-w-2xl h-[min(64vh,540px)] rounded-2xl overflow-hidden pointer-events-auto flex flex-col"
              style={{
                background: 'rgba(0,0,0,0.96)',
                border: `1px solid ${MODE_BORDER[mode]}`,
                boxShadow: `0 0 80px ${MODE_GLOW[mode]}, 0 28px 56px rgba(0,0,0,0.6)`,
              }}
              initial={{
                opacity: 0,
                scale: 0.18,
                y: 48,
                filter: 'blur(12px)',
              }}
              animate={{
                opacity: phase === 'closing' ? 0 : 1,
                scale: phase === 'closing' ? 0.22 : 1,
                y: phase === 'closing' ? 40 : 0,
                filter: phase === 'closing' ? 'blur(10px)' : 'blur(0px)',
              }}
              exit={{
                opacity: 0,
                scale: 0.2,
                y: 36,
                filter: 'blur(10px)',
              }}
              transition={{ duration: 0.52, ease: EASE_EMERGE }}
            >
              {/* Top energy slit — "projected from sphere" */}
              <motion.div
                className="absolute top-0 left-1/2 -translate-x-1/2 h-[2px] z-20"
                initial={{ width: '8%', opacity: 0.9 }}
                animate={{ width: phase === 'closing' ? '8%' : '42%', opacity: 0.75 }}
                transition={{ duration: 0.55, ease: EASE_EMERGE }}
                style={{
                  background: `linear-gradient(90deg, transparent, ${MODE_BORDER[mode]}, transparent)`,
                  boxShadow: `0 0 18px ${MODE_GLOW[mode]}`,
                }}
              />

              <div
                className="absolute inset-0 pointer-events-none rounded-2xl"
                style={{
                  background: `radial-gradient(ellipse at 50% 120%, ${MODE_GLOW[mode]}, transparent 55%)`,
                }}
              />

              <div className="absolute top-2 right-2 z-10">
                <button
                  type="button"
                  onClick={() => dismiss()}
                  className="rounded-full p-1.5"
                  style={{
                    background: 'rgba(255,255,255,0.06)',
                    color: 'rgba(255,255,255,0.5)',
                    border: '1px solid rgba(255,255,255,0.08)',
                  }}
                  title="Return to sphere (Esc)"
                >
                  <X size={14} />
                </button>
              </div>

              <div className="relative flex-1 min-h-0">
                {payload.mode === 'document' && <DocumentProjection payload={payload} />}
                {payload.mode === 'code' && <CodeProjection payload={payload} />}
                {payload.mode === 'image' && <ImageProjection payload={payload} />}
                {payload.mode === 'media' && <ImageProjection payload={payload} />}
                {payload.mode === 'chart' && <ChartProjection payload={payload} />}
                {payload.mode === 'map' && <MapProjection payload={payload} />}
              </div>

              <div
                className="flex-shrink-0 px-4 py-2 text-[8px] tracking-[0.14em] uppercase text-center"
                style={{ color: 'rgba(255,255,255,0.22)', borderTop: '1px solid rgba(255,255,255,0.06)' }}
              >
                {mode} · emerges from sphere · Esc to return
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
