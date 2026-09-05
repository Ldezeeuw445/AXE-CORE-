/**
 * HomeStage — Home's stage, en verder niets.
 *
 * ## Waarom dit bestaat
 *
 * De echte Home zit achter het inlogscherm, en de scenes renderen pas na auth.
 * Daardoor kon niemand — Luka niet en ik niet — zien hoe de plaat er met de
 * échte 3D uitziet; er werd steeds geoordeeld op een losse HTML-demo die de
 * scenes namaakte. Dit venster haalt die muur weg door alles behalve de stage
 * te laten vallen: geen rails, geen chat, geen navigatie, geen auth.
 *
 * Het is dus geen tweede app maar een kijkvenster op precies vier componenten,
 * en het gebruikt DEZELFDE componenten als Home. Wat je hier ziet is wat daar
 * staat; als het hier goed is, is het daar goed.
 *
 * ## Wat er bewust niet in zit
 *
 * De widgets in de linker- en rechterrail. Die komen pas terug als de plaat en
 * de wereld kloppen — anders beoordeel je twee dingen tegelijk en weet je bij
 * een verkeerd gevoel niet welke van de twee het deed.
 *
 * ## De standwissel
 *
 * `data-look` hoort op <html> en wordt in de app door useLook gezet (cloud +
 * apparaat). Hier zetten we hem rechtstreeks: dit venster heeft geen account,
 * en de hele reden dat het bestaat is de twee standen naast elkaar kunnen
 * leggen zonder in te loggen.
 */
import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { BrainCircuit, Mountain, Network, Layers, Square } from 'lucide-react';
import { AxeCoreSphere } from '@/presentation/components/axe-core/sphere/AxeCoreSphere';
import { RuntimeWorkspace } from '@/presentation/components/axe-core/RuntimeCanvas';
import NeuralBrain from '@/presentation/components/axe-core/NeuralBrain';
import { NeuralMemorySystem } from '@/presentation/components/axe-core/NeuralMemorySystem';
import { AxeAtmosphere } from '@/presentation/components/layout/AxeAtmosphere';
import { isLook, type Look } from '@/domain/look';

type CoreView = 'axe' | 'neural' | 'terrain' | 'runtime';

/* Zelfde volgorde en zelfde labels als Home. Een tweede volgorde hier zou
   betekenen dat het venster iets anders laat zien dan het beweert. */
const VIEWS: Array<{ id: CoreView; label: string; icon: typeof BrainCircuit | null }> = [
  { id: 'axe', label: 'Core', icon: null },
  { id: 'neural', label: 'Neural', icon: BrainCircuit },
  { id: 'terrain', label: 'Terrain', icon: Mountain },
  { id: 'runtime', label: 'Architecture', icon: Network },
];

const LOOK_KEY = 'axe-stage-look';

export default function HomeStage() {
  const [view, setView] = useState<CoreView>('axe');
  const [look, setLook] = useState<Look>('glass');

  /* De stand staat op <html>, niet op een container: axe-look.css hangt aan
     :root[data-look] en zou een element-scoped attribuut nooit zien. */
  useEffect(() => {
    let start: Look = 'glass';
    try {
      const bewaard = localStorage.getItem(LOOK_KEY);
      if (isLook(bewaard)) start = bewaard;
    } catch {
      /* privémodus — dan gewoon de standaard */
    }
    setLook(start);
  }, []);

  useEffect(() => {
    document.documentElement.dataset.look = look;
    try {
      localStorage.setItem(LOOK_KEY, look);
    } catch {
      /* privémodus — de stand geldt dan alleen deze sessie */
    }
  }, [look]);

  return (
    <>
      {/* De sterren staan BUITEN de schil, op z-index 0: backdrop-filter
          vervaagt alleen wat achter een element ligt. Erbinnen zou je scherpe
          sterren zien in plaats van glas. */}
      <AxeAtmosphere />

    <div className="axe-shell relative h-[100dvh] w-full overflow-hidden">
      {/* ── De wereld ──────────────────────────────────────────────────
          Alle vier vullen het venster. SphereStage blijft altijd gemount —
          precies zoals op Home — omdat opnieuw opbouwen van een WebGL-scene
          bij elke tabwissel een hapering geeft die je niet meer wegkrijgt. */}
      <div className="absolute inset-0">
        <div
          className="absolute inset-0"
          style={{
            opacity: view === 'axe' ? 1 : 0,
            pointerEvents: view === 'axe' ? 'auto' : 'none',
            zIndex: view === 'axe' ? 10 : 0,
          }}
        >
          {/* Onze sphere uit demo/plaat, niet de Three-versie: die stapelt
              bloom en additieve halo's, wat op een lichte plaat dichtslaat en
              de vorm in de gloed laat verdwijnen. SphereStage blijft bestaan,
              dus terug is één import. */}
          <AxeCoreSphere />
        </div>

        <AnimatePresence>
          {view === 'neural' && (
            <motion.div
              key="neural"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.25 }}
              className="absolute inset-0 z-10"
            >
              <NeuralBrain />
            </motion.div>
          )}
          {view === 'terrain' && (
            <motion.div
              key="terrain"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.25 }}
              className="absolute inset-0 z-10"
            >
              <NeuralMemorySystem />
            </motion.div>
          )}
          {view === 'runtime' && (
            <motion.div
              key="runtime"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.25 }}
              className="absolute inset-0 z-10"
            >
              <RuntimeWorkspace />
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* ── De standwissel, midden boven ────────────────────────────────
          Sleepgebied eromheen: zonder titelbalk is de kop het enige waarmee
          je het Tauri-venster nog kunt verplaatsen. */}
      <div
        data-tauri-drag-region
        className="absolute inset-x-0 top-0 z-20 flex h-14 items-center justify-center"
      >
        <div
          className="flex items-center rounded-full p-0.5"
          style={{
            background: 'rgba(8,10,14,0.55)',
            border: '1px solid rgba(255,255,255,0.08)',
            backdropFilter: 'blur(10px)',
          }}
          role="tablist"
          aria-label="Core view"
        >
          {VIEWS.map(seg => {
            const active = view === seg.id;
            const Icon = seg.icon;
            /* Zelfde accenten als Home: violet voor Neural, cyaan voor
               Architecture, neutraal wit voor de rest. */
            const accent =
              seg.id === 'neural'
                ? { bg: 'rgba(139,92,246,0.28)', border: 'rgba(139,92,246,0.55)', color: '#c4b5fd' }
                : seg.id === 'runtime'
                  ? { bg: 'var(--tint-line)', border: 'var(--tint-line)', color: 'var(--accent-cyan)' }
                  : { bg: 'rgba(255,255,255,0.1)', border: 'rgba(255,255,255,0.14)', color: 'rgba(255,255,255,0.92)' };
            return (
              <button
                key={seg.id}
                role="tab"
                aria-selected={active}
                onClick={() => setView(seg.id)}
                className="flex items-center gap-1 rounded-full px-2.5 py-1.5 text-[10px] font-medium transition-all"
                style={{
                  background: active ? accent.bg : 'transparent',
                  border: `1px solid ${active ? accent.border : 'transparent'}`,
                  color: active ? accent.color : 'rgba(255,255,255,0.38)',
                }}
              >
                {Icon ? <Icon size={11} /> : null}
                {seg.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* De standwissel rechtsboven — zelfde iconen als LookToggle in de app. */}
      <button
        onClick={() => setLook(look === 'glass' ? 'black' : 'glass')}
        className="absolute right-4 top-4 z-20 grid h-8 w-8 place-items-center rounded-lg transition-colors"
        style={{
          background: 'rgba(8,10,14,0.55)',
          border: '1px solid rgba(255,255,255,0.08)',
          backdropFilter: 'blur(10px)',
          color: look === 'glass' ? 'var(--accent-cyan)' : 'rgba(255,255,255,0.5)',
        }}
        aria-pressed={look === 'glass'}
        title={look === 'glass' ? 'Glass pane — click for the black pane' : 'Black pane — click for glass'}
      >
        {look === 'glass' ? <Layers size={15} /> : <Square size={15} />}
      </button>
    </div>
    </>
  );
}
