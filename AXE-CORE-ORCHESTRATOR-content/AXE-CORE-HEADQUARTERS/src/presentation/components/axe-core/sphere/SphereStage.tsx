/**
 * SphereStage — Living Display shell.
 * The sphere never unmounts. Projections animate over it.
 * Presentation only renders store payload — no file I/O here.
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
  const dismiss = useSphereProjectionStore(s => s.dismiss);
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
    const t = setTimeout(() => markProjecting(), 400);
    return () => clearTimeout(t);
  }, [phase, markProjecting]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && projecting) dismiss();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [projecting, dismiss]);

  // Content-aware morph hint (presentation signal only)
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
          opacity: projecting ? 0.32 : 1,
          scale: phase === 'opening' ? 1.07 : phase === 'closing' ? 0.97 : 1,
        }}
        transition={{ duration: 0.42, ease: [0.16, 1, 0.3, 1] }}
      >
        <HolographicSphere status={status} />
      </motion.div>

      <AnimatePresence>
        {payload && phase !== 'idle' && (
          <motion.div
            key={payload.id}
            className="absolute inset-0 z-10 flex items-center justify-center p-4 md:p-8 pointer-events-none"
            initial={{ opacity: 0 }}
            animate={{ opacity: phase === 'closing' ? 0 : 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.35 }}
          >
            <motion.div
              className="relative w-full max-w-xl md:max-w-2xl h-[min(62vh,520px)] rounded-2xl overflow-hidden pointer-events-auto flex flex-col"
              style={{
                background: 'rgba(0,0,0,0.93)',
                border: `1px solid ${MODE_BORDER[mode]}`,
                boxShadow: `0 0 60px ${MODE_GLOW[mode]}, 0 24px 48px rgba(0,0,0,0.5)`,
              }}
              initial={{ opacity: 0, scale: 0.82, y: 28 }}
              animate={{
                opacity: phase === 'closing' ? 0 : 1,
                scale: phase === 'closing' ? 0.88 : 1,
                y: phase === 'closing' ? 18 : 0,
              }}
              exit={{ opacity: 0, scale: 0.85, y: 20 }}
              transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
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
