/**
 * SphereStage — Living Display on Home.
 * Maps: large square interactive portal (Google 2D or MapLibre).
 */
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X } from 'lucide-react';
import { HolographicSphere, type CoreStatus } from '@/presentation/components/axe-core/HolographicSphere';
import { useSphereProjectionStore } from '@/presentation/store/sphereProjectionStore';
import { ProjectionBody } from '@/presentation/components/axe-core/sphere/ProjectionBody';
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
  html: 'rgba(34,211,238,0.55)',
};

const MODE_GLOW: Record<ProjectionMode, string> = {
  none: 'rgba(34,211,238,0.2)',
  document: 'rgba(34,211,238,0.22)',
  code: 'rgba(34,211,238,0.25)',
  image: 'rgba(165,243,252,0.2)',
  media: 'rgba(165,243,252,0.2)',
  chart: 'rgba(212,252,52,0.25)',
  map: 'rgba(167,139,250,0.3)',
  html: 'rgba(34,211,238,0.25)',
};

const MODE_MORPH: Record<ProjectionMode, string> = {
  none: 'sphere',
  document: 'scatter',
  code: 'scatter',
  image: 'scatter',
  media: 'scatter',
  chart: 'scatter',
  map: 'scatter',
  html: 'scatter',
};

const EASE_EMERGE = [0.16, 1, 0.3, 1] as const;

/**
 * `bol`: welke sphere er onder de projectie staat. Op de plaat (Tauri-glas) is dat
 * AxeCoreSphere, daarbuiten de Three-versie. Tot 9 okt 2026 tekende Home op de
 * plaat alleen AxeCoreSphere, en dan was dit hele podium er niet: "laat New York
 * zien" maakte een projectie die nergens werd getoond, op de Mac mini en de iMac.
 */
export function SphereStage({ status, bol }: { status: CoreStatus; bol?: ReactNode }) {
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
  useMemo(() => moodForMode(mode), [mode]);

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
    phase === 'opening' || phase === 'projecting' ? 0.2
      : phase === 'closing' ? 0.7
        : 1;

  const sphereScale =
    phase === 'opening' || phase === 'projecting' ? 1.03
      : phase === 'closing' ? 1.02
        : 1;

  const showPortal = !!payload && (phase === 'opening' || phase === 'projecting' || phase === 'closing');

  /* Hoeveel ruimte er BOVEN de composer is. Het podium loopt op de plaat door tot
     onder de composer (Home geeft het de hele hoogte als --axe-bol-vak nog niet
     gemeten is), dus een kaart van 94vmin viel er half onder (Luka, 9 okt: "de
     map valt onder de composer door"). Gemeten tegen --axe-chat-top, de
     bovenkant van de composer die AxeShellChrome bijhoudt. */
  const podium = useRef<HTMLDivElement | null>(null);
  const [vrij, setVrij] = useState<{ hoog: number; top: number } | null>(null);
  useEffect(() => {
    const meet = () => {
      const el = podium.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      const chatTop = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--axe-chat-top'));
      const onder = Number.isFinite(chatTop) && chatTop > r.top ? Math.min(r.bottom, chatTop - 14) : r.bottom;
      // Boven: vrij van de kopbalk (tabs en knoppen, ~64px).
      const boven = Math.max(r.top, 64);
      setVrij({ hoog: Math.max(220, Math.round(onder - boven)), top: Math.round(boven - r.top) });
    };
    meet();
    window.addEventListener('resize', meet);
    const t = window.setInterval(meet, 1500); // composer groeit mee met tekst
    return () => { window.removeEventListener('resize', meet); window.clearInterval(t); };
  }, [showPortal]);

  // Document, voorbeeld, code en grafiek: een leesvlak in plaats van een cirkel.
  const breed = mode === 'document' || mode === 'html' || mode === 'code' || mode === 'chart';
  // Ruimte voor het onderschrift onder de kaart (~34px).
  const ONDERSCHRIFT = 34;
  const mapSide = vrij
    ? `min(${vrij.hoog - ONDERSCHRIFT}px, 94vw, 920px)`
    : 'min(94vmin, 920px)';

  return (
    <div ref={podium} className="absolute inset-0 overflow-hidden">
      <motion.div
        className="absolute inset-0"
        animate={{
          opacity: sphereOpacity,
          scale: sphereScale,
          filter:
            phase === 'opening' || phase === 'projecting'
              ? 'brightness(1.1) saturate(1.1)'
              : 'none',
        }}
        transition={{ duration: 0.45, ease: EASE_EMERGE }}
      >
        {bol ?? <HolographicSphere status={status} />}
      </motion.div>

      <AnimatePresence>
        {(phase === 'opening' || phase === 'projecting') && mode === 'map' && (
          <motion.div
            key="bloom"
            className="absolute inset-0 pointer-events-none z-[5]"
            initial={{ opacity: 0 }}
            animate={{ opacity: 0.55 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.3 }}
          >
            <div
              className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2"
              style={{
                width: mapSide,
                height: mapSide,
                borderRadius: 20,
                background: `radial-gradient(circle, ${MODE_GLOW[mode]} 0%, transparent 70%)`,
                boxShadow: `0 0 100px ${MODE_GLOW[mode]}`,
              }}
            />
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence mode="sync">
        {showPortal && payload && (
          <motion.div
            key={payload.id}
            className="absolute left-0 right-0 z-20 flex items-center justify-center pointer-events-none"
            style={vrij ? { top: vrij.top, height: vrij.hoog } : { top: 0, bottom: 0 }}
            initial={{ opacity: 0, scale: 0.55 }}
            animate={{ opacity: phase === 'closing' ? 0 : 1, scale: phase === 'closing' ? 0.55 : 1 }}
            exit={{ opacity: 0, scale: 0.5 }}
            transition={{ duration: 0.35, ease: EASE_EMERGE }}
          >
            <div className="relative pointer-events-auto flex flex-col items-center max-w-full max-h-full">
              <div
                className="relative overflow-hidden flex flex-col"
                style={mode === 'map' ? {
                  width: mapSide,
                  height: mapSide,
                  maxWidth: '96vw',
                  maxHeight: '88vh',
                  borderRadius: 18,
                  background: '#05050c',
                  border: `2px solid ${MODE_BORDER[mode]}`,
                  boxShadow: `0 0 0 4px rgba(0,0,0,0.4), 0 0 50px ${MODE_GLOW[mode]}`,
                  // Ensure browser doesn't steal touch/scroll for page
                  touchAction: 'none',
                } : breed ? {
                  /* Lezen en kijken: een liggend vlak, zo hoog als er boven de composer
                     ruimte is. Een document of voorbeeld in een cirkel van 560px was
                     onleesbaar (10px mono, de hoeken weg). */
                  width: 'min(920px, 72vw)',
                  height: vrij ? `min(${vrij.hoog - ONDERSCHRIFT}px, 720px)` : 'min(72vh, 720px)',
                  borderRadius: 18,
                  background: 'rgba(8,10,16,0.94)',
                  border: `1.5px solid ${MODE_BORDER[mode]}`,
                  boxShadow: `0 0 0 4px rgba(0,0,0,0.35), 0 0 50px ${MODE_GLOW[mode]}`,
                } : {
                  width: vrij ? `min(${vrij.hoog - ONDERSCHRIFT}px, 72vmin, 560px)` : 'min(72vmin, 560px)',
                  height: vrij ? `min(${vrij.hoog - ONDERSCHRIFT}px, 72vmin, 560px)` : 'min(72vmin, 560px)',
                  borderRadius: '50%',
                  background: 'rgba(5,5,12,0.92)',
                  border: `2px solid ${MODE_BORDER[mode]}`,
                  boxShadow: `0 0 0 4px rgba(0,0,0,0.35), 0 0 60px ${MODE_GLOW[mode]}`,
                }}
                onWheel={(e) => {
                  if (mode === 'map' || breed) e.stopPropagation();
                }}
              >
                <button
                  type="button"
                  onClick={() => dismiss()}
                  className="absolute top-3 right-3 z-30 rounded-full p-1.5"
                  style={{
                    background: 'rgba(0,0,0,0.75)',
                    color: 'rgba(255,255,255,0.85)',
                    border: '1px solid rgba(255,255,255,0.18)',
                  }}
                  title="Esc"
                >
                  <X size={15} />
                </button>

                <div
                  className="relative flex-1 min-h-0 z-[1]"
                  style={{
                    minHeight: mode === 'map' ? 320 : undefined,
                    height: mode === 'map' || breed ? '100%' : undefined,
                  }}
                >
                  <ProjectionBody payload={payload} />
                </div>
              </div>

              {/* Onderschrift en, als er meer dan één ding op Home staat, de andere
                  als kleine knoppen ernaast. Die stonden bovenaan (top-12), onder de
                  kopbalk en achter de kaart: het "blauwe knopje dat je niet kon lezen"
                  (Luka, 9 okt). */}
              <div className="mt-2.5 flex max-w-full flex-wrap items-center justify-center gap-1.5">
              <div
                className="px-4 py-1.5 rounded-full text-[10px] font-medium tracking-wide"
                style={{
                  color: '#e9d5ff',
                  background: 'rgba(0,0,0,0.8)',
                  border: `1px solid ${MODE_BORDER[mode]}`,
                }}
              >
                {payload.mode === 'map'
                  ? `MAP · ${payload.title} · sleep · scroll zoom · Esc`
                  : `${payload.mode.toUpperCase()} · ${payload.title}`}
              </div>
                {queue.length > 1 && queue.filter(q => q.id !== payload.id).map(q => (
                  <button
                    key={q.id}
                    type="button"
                    onClick={() => focus(q.id)}
                    className="rounded-full px-2.5 py-1 text-[10px] font-medium truncate max-w-[140px]"
                    style={{ background: 'rgba(0,0,0,0.7)', border: '1px solid rgba(255,255,255,0.14)', color: 'rgba(255,255,255,0.7)' }}
                    title={`${q.mode} · ${q.title}`}
                  >
                    {q.mode} · {q.title}
                  </button>
                ))}
                {queue.length > 1 && (
                  <button
                    type="button"
                    onClick={() => dismissAll()}
                    className="rounded-full px-2 py-1 text-[10px]"
                    style={{ background: 'rgba(0,0,0,0.6)', color: 'rgba(255,255,255,0.5)', border: '1px solid rgba(255,255,255,0.1)' }}
                  >
                    clear
                  </button>
                )}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
