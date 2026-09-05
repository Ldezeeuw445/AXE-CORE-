import { useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useCoreViewStore } from '@/presentation/store/coreViewStore';
import type { CoreStatus } from '@/presentation/components/axe-core/HolographicSphere';
import { SphereStage } from '@/presentation/components/axe-core/sphere/SphereStage';
import { AxeCoreSphere } from '@/presentation/components/axe-core/sphere/AxeCoreSphere';
import { useHeeftPlaat } from '@/presentation/components/axe-core/sceneBackdrop';
import { RuntimeWorkspace } from '@/presentation/components/axe-core/RuntimeCanvas';
import NeuralBrain from '@/presentation/components/axe-core/NeuralBrain';
import { NeuralMemorySystem } from '@/presentation/components/axe-core/NeuralMemorySystem';
import { AwarenessCenter } from '@/presentation/components/axe-core/AwarenessCenter';
import { LiveIndicator } from '@/presentation/components/shared/LiveIndicator';
import { useVoiceStore } from '@/presentation/store/voiceStore';
import { useIsMobile } from '@/presentation/hooks/use-mobile';
import { useSphereProjectionStore } from '@/presentation/store/sphereProjectionStore';

const cv = { hidden: { opacity: 0 }, visible: { opacity: 1, transition: { staggerChildren: 0.04, delayChildren: 0.15 } } };
const iv = { hidden: { opacity: 0, y: 14 }, visible: { opacity: 1, y: 0, transition: { duration: 0.3, ease: [0.16, 1, 0.3, 1] as never } } };



export default function Home() {
  const isMobile = useIsMobile();
  const voice = useVoiceStore();
  const spherePhase = useSphereProjectionStore(s => s.phase);
  const spherePayload = useSphereProjectionStore(s => s.payload);
  const coreView = useCoreViewStore(s => s.coreView);
  const setCoreView = useCoreViewStore(s => s.setCoreView);
  const opPlaat = useHeeftPlaat();
  /* De knop staat in de schil, dus de stand ook. Twee plekken die allebei
     bijhouden of het paneel open is, lopen gegarandeerd uit elkaar. */
  const showAwareness = useCoreViewStore(s => s.showAwareness);
  const setShowAwareness = useCoreViewStore(s => s.setShowAwareness);
  const setChatCollapsed = useCoreViewStore(s => s.setChatDicht);

  // Any living-display project → force Core view so SphereStage is visible
  useEffect(() => {
    if (spherePhase === 'opening' || spherePhase === 'projecting') {
      setCoreView('axe');
    }
  }, [spherePhase, spherePayload?.id]);

  useEffect(() => {
    const onLiving = () => setCoreView('axe');
    window.addEventListener('axe-living-display', onLiving);
    return () => window.removeEventListener('axe-living-display', onLiving);
  }, []);

  // Neural / Terrain are both full memory explorers (sidebars, composer, depth
  // control) — give them the room they need by collapsing the chat drawer
  // instead of squeezing under it.
  useEffect(() => {
    if (coreView === 'neural' || coreView === 'terrain') setChatCollapsed(true);
  }, [coreView]);



  // Any living-display project → force Core view so SphereStage is visible


  const coreStatus: CoreStatus = voice.pendingExec
    ? 'awaiting-approval'
    : voice.voiceStatus === 'listening'
      ? 'listening'
      : voice.voiceStatus === 'processing'
        ? 'thinking'
        : voice.voiceStatus === 'speaking'
          ? 'speaking'
          : 'idle';






  /* 58px, de maat uit de demo. Dit stond op 34 -- en omdat de plaat h-full is,
     bepaalt deze wrapper de hoogte, niet de CSS erbinnen. Een balk van 34px met
     tekst erin is geen balk meer maar een streepje. */
  /* 72px. De demo staat op 58, maar op die hoogte is er met de padding weg
     nauwelijks plaat over: je ziet de tekst en niet het gerookte glas eronder.
     Hoger is hier niet "anders dan de demo" maar het punt van de demo -- dat je
     het materiaal ziet. */

  return (
    <motion.div className="flex flex-col h-full overflow-hidden" variants={cv} initial="hidden" animate="visible">
      <motion.div variants={iv} className="flex-1 min-h-0">
        <div
          className="axe-scene h-full relative rounded-2xl overflow-hidden"
          style={{ backgroundColor: 'var(--bg-base)' }}
        >

          <div className="axe-home-status absolute top-4 left-4 flex items-center gap-2 z-20 over-canvas-group">
            {(() => {
              const lastMsg = voice.conversation[voice.conversation.length - 1];
              const hasError = lastMsg?.role === 'axe' && lastMsg?.provider === 'error';
              // "Is there anything that can answer?" — not "is a Primary set?".
              //
              // This read !!primarySlot || routingLog.length, so switching the
              // Primary slot off (which is now allowed on purpose) made the
              // badge say NO AI on a machine where Ollama answered in 184ms and
              // OpenRouter in 180ms. The whole point of the fallback chain is
              // that no single slot decides whether AXE works, so the badge must
              // not be tied to one either.
              const hasProvider = !!voice.primarySlot
                || !!voice.fallback1Slot || !!voice.fallback2Slot || !!voice.fallback3Slot
                || voice.routingLog.length > 0;
              const statusLabel: Partial<Record<CoreStatus, string>> = {
                'awaiting-approval': 'AWAITING APPROVAL', listening: 'LISTENING', thinking: 'THINKING', speaking: 'SPEAKING',
              };
              const statusColor: Partial<Record<CoreStatus, string>> = {
                'awaiting-approval': 'rgb(251,146,60)', listening: 'var(--accent-cyan)', thinking: '#a78bfa', speaking: 'var(--accent-cyan)',
              };
              const label = statusLabel[coreStatus] ?? (hasError ? 'ERROR' : hasProvider ? 'CORE ACTIVE' : 'NO AI');
              const color = statusColor[coreStatus] ?? (hasError ? 'var(--error)' : hasProvider ? 'var(--accent-cyan)' : 'var(--warning)');
              const dotColor = statusColor[coreStatus] ?? (hasError ? 'var(--error)' : hasProvider ? 'var(--success)' : 'var(--warning)');
              return (<>
                <LiveIndicator size={6} color={dotColor} />
                <span className="text-xs-custom font-mono-data" style={{ color }}>{label}</span>
              </>);
            })()}
          </div>

          {/* Home-level proof that store has payload — cannot be missed */}
          {spherePayload && spherePhase !== 'idle' && (
            <div
              className="absolute top-12 left-1/2 -translate-x-1/2 z-50 rounded-full px-3 py-1 text-[10px] font-medium pointer-events-none"
              style={{
                background: 'rgba(167,139,250,0.25)',
                border: '1px solid rgba(167,139,250,0.7)',
                color: '#e9d5ff',
                boxShadow: '0 0 24px rgba(167,139,250,0.35)',
              }}
            >
              {spherePayload.mode} · {spherePayload.title}
            </div>
          )}


          {/* Purely decorative watermark — on mobile it sits directly behind
              the tab pills above, so it only adds visual noise to the exact
              spot that's already tight on room. Desktop has space to spare. */}
          {!isMobile && (
            <div className="absolute top-4 left-1/2 -translate-x-1/2 text-[9px] font-mono-data z-20 pointer-events-none" style={{ color: 'rgba(255,255,255,0.12)' }}>
              v5.0
            </div>
          )}

          {showAwareness && (
            <AwarenessCenter
              onClose={() => setShowAwareness(false)}
              onApprove={(proposal) => {
                void voice.sendMessage(`${proposal.title}: ${proposal.context}`);
                setShowAwareness(false);
              }}
            />
          )}

          {/* SphereStage ALWAYS mounted on Home — never unmount on view switch */}
          <div className="absolute inset-0">
            <div
              className="absolute inset-0"
              style={{
                opacity: coreView === 'axe' ? 1 : 0,
                pointerEvents: coreView === 'axe' ? 'auto' : 'none',
                zIndex: coreView === 'axe' ? 10 : 0,
              }}
            >
              {/* Op de plaat onze canvas-sphere, daarbuiten de Three-versie.
                  Die stapelt bloom en additief gemengde halo's: dat werkt op
                  zwart, maar slaat dicht op een lichte plaat en dan verdwijnt
                  de vorm in de gloed. Beide blijven bestaan. */}
              {opPlaat ? <AxeCoreSphere /> : <SphereStage status={coreStatus} />}
            </div>
            <AnimatePresence>
              {coreView === 'runtime' && (
                <motion.div key="arch" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.25 }} className="absolute inset-0 z-10">
                  <RuntimeWorkspace />
                </motion.div>
              )}
              {coreView === 'neural' && (
                <motion.div key="neural" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.25 }} className="absolute inset-0 z-10">
                  <NeuralBrain />
                </motion.div>
              )}
              {coreView === 'terrain' && (
                <motion.div key="terrain" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.25 }} className="absolute inset-0 z-10">
                  <NeuralMemorySystem />
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>
      </motion.div>


    </motion.div>
  );
}
