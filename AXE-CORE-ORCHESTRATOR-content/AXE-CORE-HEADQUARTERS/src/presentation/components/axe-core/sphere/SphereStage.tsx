/**
 * SphereStage — Living Display on Home.
 * Maps always use InteractiveMapProjection (MapLibre) — reliable pan/zoom.
 * Google Photorealistic 3D is broken without billing; do not gate Home on it.
 */
import { useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X } from 'lucide-react';
import { HolographicSphere, type CoreStatus } from '@/presentation/components/axe-core/HolographicSphere';
import { useSphereProjectionStore } from '@/presentation/store/sphereProjectionStore';
import { DocumentProjection } from '@/presentation/components/axe-core/sphere/projections/DocumentProjection';
import { ImageProjection } from '@/presentation/components/axe-core/sphere/projections/ImageProjection';
import { ChartProjection } from '@/presentation/components/axe-core/sphere/projections/ChartProjection';
import { InteractiveMapProjection } from '@/presentation/components/axe-core/sphere/projections/InteractiveMapProjection';
import { CodeProjection } from '@/presentation/components/axe-core/sphere/projections/CodeProjection';
import { subscribeAxeEvent } from '@/infrastructure/events/eventBus';
import { moodForMode, type ProjectionMode, type ProjectionPayload } from '@/domain/sphere/projectionTypes';

const MODE_BORDER: Record<ProjectionMode, string> = {
  none: 'rgba(34,211,238,0.45)',
  document: 'rgba(34,211,238,0.5)',
  code: 'rgba(34,211,238,0.55)',
  image: 'rgba(165,243,252,0.5)',
  media: 'rgba(165,243,252,0.5)',
  chart: 'rgba(212,252,52,0.55)',
  map: 'rgba(167,139,250,0.65)',
};

const MODE_GLOW: Record<ProjectionMode, string> = {
  none: 'rgba(34,211,238,0.2)',
  document: 'rgba(34,211,238,0.22)',
  code: 'rgba(34,211,238,0.25)',
  image: 'rgba(165,243,252,0.2)',
  media: 'rgba(165,243,252,0.2)',
  chart: 'rgba(212,252,52,0.25)',
  map: 'rgba(167,139,250,0.3)',
};

const MODE_MORPH: Record<ProjectionMode, string> = {
  none: 'sphere',
  document: 'scatter',
  code: 'scatter',
  image: 'scatter',
  media: 'scatter',
  chart: 'scatter',
  map: 'scatter',
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
    const t = setTimeout(() => markProjecting(), 100);
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

  const sphereOpacity =
    phase === 'opening' || phase === 'projecting' ? 0.3
      : phase === 'closing' ? 0.7
        : 1;

  const sphereScale =
    phase === 'opening' || phase === 'projecting' ? 1.05
      : phase === 'closing' ? 1.02
        : 1;

  const showPortal = !!payload && (phase === 'opening' || phase === 'projecting' || phase === 'closing');

  return (
    <div className="absolute inset-0 overflow-hidden">
      <motion.div
        className="absolute inset-0"
        animate={{
          opacity: sphereOpacity,
          scale: sphereScale,
          filter:
            phase === 'opening' || phase === 'projecting'
              ? 'brightness(1.15) saturate(1.15)'
              : 'none',
        }}
        transition={{ duration: 0.45, ease: EASE_EMERGE }}
      >
        <HolographicSphere status={status} />
      </motion.div>

      <AnimatePresence>
        {(phase === 'opening' || phase === 'projecting') && (
          <motion.div
            key="bloom"
            className="absolute inset-0 pointer-events-none z-[5]"
            initial={{ opacity: 0 }}
            animate={{ opacity: 0.9 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.3 }}
          >
            <div
              className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-[min(90vw,700px)] h-[min(90vw,700px)] rounded-full"
              style={{
                background: `radial-gradient(circle, ${MODE_GLOW[mode]} 0%, transparent 64%)`,
                boxShadow: `0 0 120px ${MODE_GLOW[mode]}`,
              }}
            />
          </motion.div>
        )}
      </AnimatePresence>

      {queue.length > 1 && showPortal && (
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
                  background: active ? 'rgba(34,211,238,0.25)' : 'rgba(0,0,0,0.6)',
                  border: `1px solid ${active ? MODE_BORDER[q.mode] : 'rgba(255,255,255,0.12)'}`,
                  color: active ? '#a5f3fc' : 'rgba(255,255,255,0.45)',
                }}
              >
                {q.mode} · {q.title}
              </button>
            );
          })}
          <button
            type="button"
            onClick={() => dismissAll()}
            className="rounded-full px-2 py-1 text-[9px]"
            style={{ color: 'rgba(255,255,255,0.4)', border: '1px solid rgba(255,255,255,0.1)' }}
          >
            clear
          </button>
        </div>
      )}

      <AnimatePresence mode="sync">
        {showPortal && payload && (
          <motion.div
            key={payload.id}
            className="absolute inset-0 z-20 flex items-center justify-center pointer-events-none"
            initial={{ opacity: 0, scale: 0.5 }}
            animate={{ opacity: phase === 'closing' ? 0 : 1, scale: phase === 'closing' ? 0.5 : 1 }}
            exit={{ opacity: 0, scale: 0.45 }}
            transition={{ duration: 0.4, ease: EASE_EMERGE }}
          >
            <div className="relative pointer-events-auto flex flex-col items-center">
              {/* Maps: large rectangle for pan/zoom. Other modes: circular portal. */}
              <div
                className="relative overflow-hidden flex flex-col"
                style={mode === 'map' ? {
                  width: 'min(92vw, 900px)',
                  height: 'min(78vh, 620px)',
                  borderRadius: 20,
                  background: 'rgba(5,5,12,0.92)',
                  border: `2px solid ${MODE_BORDER[mode]}`,
                  boxShadow: `0 0 0 4px rgba(0,0,0,0.35), 0 0 60px ${MODE_GLOW[mode]}, 0 0 120px ${MODE_GLOW[mode]}`,
                } : {
                  width: 'min(82vmin, 640px)',
                  height: 'min(82vmin, 640px)',
                  borderRadius: '50%',
                  background: 'rgba(5,5,12,0.92)',
                  border: `2px solid ${MODE_BORDER[mode]}`,
                  boxShadow: `0 0 0 4px rgba(0,0,0,0.35), 0 0 60px ${MODE_GLOW[mode]}, 0 0 120px ${MODE_GLOW[mode]}`,
                }}
              >
                <button
                  type="button"
                  onClick={() => dismiss()}
                  className="absolute top-3 right-3 z-20 rounded-full p-1.5"
                  style={{
                    background: 'rgba(0,0,0,0.65)',
                    color: 'rgba(255,255,255,0.75)',
                    border: '1px solid rgba(255,255,255,0.15)',
                  }}
                  title="Esc"
                >
                  <X size={14} />
                </button>

                <div className="relative flex-1 min-h-0 z-[1]" style={{ minHeight: mode === 'map' ? 240 : undefined }}>
                  {payload.mode === 'document' && <DocumentProjection payload={payload} />}
                  {payload.mode === 'code' && <CodeProjection payload={payload} />}
                  {payload.mode === 'image' && <ImageProjection payload={payload} />}
                  {payload.mode === 'media' && <ImageProjection payload={payload} />}
                  {payload.mode === 'chart' && <ChartProjection payload={payload} />}
                  {payload.mode === 'map' && <InteractiveMapProjection payload={payload} />}
                  {!['document', 'code', 'image', 'media', 'chart', 'map'].includes(payload.mode) && (
                    <div className="h-full flex items-center justify-center text-[12px]" style={{ color: '#a5f3fc' }}>
                      {payload.title}
                    </div>
                  )}
                </div>
              </div>

              <div
                className="mt-3 px-4 py-1.5 rounded-full text-[10px] font-medium tracking-wide"
                style={{
                  color: '#e9d5ff',
                  background: 'rgba(0,0,0,0.75)',
                  border: `1px solid ${MODE_BORDER[mode]}`,
                  boxShadow: `0 0 20px ${MODE_GLOW[mode]}`,
                }}
              >
                {payload.mode === 'map'
                  ? `MAP · ${payload.title} · drag · scroll zoom`
                  : `${payload.mode.toUpperCase()} · ${payload.title}`}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
