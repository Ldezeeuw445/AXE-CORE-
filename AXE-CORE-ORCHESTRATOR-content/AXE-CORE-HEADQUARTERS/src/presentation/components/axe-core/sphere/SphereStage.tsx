/**
 * SphereStage — Living Display shell.
 * Sphere never unmounts. Queue chips switch focus (max 3).
 * Presentation only renders store payload.
 */
import { useEffect } from 'react';
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
import type { ProjectionMode } from '@/domain/sphere/projectionTypes';

const MODE_BORDER: Record<ProjectionMode, string> = {
  none: 'rgba(34,211,238,0.28)',
  document: 'rgba(34,211,238,0.32)',
  code: 'rgba(34,211,238,0.4)',
  image: 'rgba(165,243,252,0.35)',
  media: 'rgba(165,243,252,0.35)',
  chart: 'rgba(212,252,52,0.4)',
  map: 'rgba(167,139,250,0.45)',
};

const MODE_GLOW: Record<ProjectionMode, string> = {
  none: 'rgba(34,211,238,0.12)',
  document: 'rgba(34,211,238,0.12)',
  code: 'rgba(34,211,238,0.14)',
  image: 'rgba(165,243,252,0.12)',
  media: 'rgba(165,243,252,0.12)',
  chart: 'rgba(212,252,52,0.14)',
  map: 'rgba(167,139,250,0.16)',
};

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

  useEffect(() => {
    const unsub1 = subscribeAxeEvent('axe:sphere-project', (p) => project(p));
    const unsub2 = subscribeAxeEvent('axe:sphere-dismiss', () => dismiss());
    return () => { unsub1(); unsub2(); };
  }, [project, dismiss]);

  useEffect(() => {
    if (phase !== 'opening') return;
    const t = setTimeout(() => markProjecting(), 320);
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
    if (!payload || phase === 'idle' || phase === 'closing') return;
    const key =
      mode === 'chart' ? 'saturn'
        : mode === 'map' ? 'galaxy'
          : mode === 'code' ? 'cube'
            : mode === 'image' ? 'torus'
              : 'sphere';
    window.dispatchEvent(new CustomEvent('axe-sphere-morph', { detail: { key } }));
  }, [payload?.id, mode, phase]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="absolute inset-0">
      <motion.div
        className="absolute inset-0"
        animate={{
          opacity: projecting ? 0.28 : 1,
          scale: phase === 'opening' ? 1.08 : phase === 'closing' ? 0.96 : 1,
        }}
        transition={{ duration: 0.38, ease: [0.16, 1, 0.3, 1] }}
      >
        <HolographicSphere status={status} />
      </motion.div>

      {/* Queue dock — held in the sphere */}
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
            transition={{ duration: 0.28 }}
          >
            <motion.div
              className="relative w-full max-w-xl md:max-w-2xl h-[min(62vh,520px)] rounded-2xl overflow-hidden pointer-events-auto flex flex-col"
              style={{
                background: 'rgba(0,0,0,0.94)',
                border: `1px solid ${MODE_BORDER[mode]}`,
                boxShadow: `0 0 70px ${MODE_GLOW[mode]}, 0 28px 56px rgba(0,0,0,0.55)`,
              }}
              initial={{ opacity: 0, scale: 0.78, y: 36 }}
              animate={{
                opacity: phase === 'closing' ? 0 : 1,
                scale: phase === 'closing' ? 0.86 : 1,
                y: phase === 'closing' ? 22 : 0,
              }}
              exit={{ opacity: 0, scale: 0.84, y: 24 }}
              transition={{ duration: 0.36, ease: [0.16, 1, 0.3, 1] }}
            >
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
