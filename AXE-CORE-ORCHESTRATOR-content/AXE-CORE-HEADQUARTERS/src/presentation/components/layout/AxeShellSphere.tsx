import { useLocation } from 'react-router';
import { HolographicSphere, type CoreStatus } from '@/presentation/components/axe-core/HolographicSphere';
import { useVoiceStore } from '@/presentation/store/voiceStore';

/**
 * De ambient AXE-bol als BLIJVENDE achtergrond achter elke pagina.
 *
 * Dit is de kern van "de plaat is de achtergrond voor elke pagina": de bol
 * hangt in de schil, niet in een pagina, dus hij blijft staan terwijl de route
 * eronder wisselt. Elke tab houdt zo zijn eigen inhoud — die zweeft er alleen
 * overheen.
 *
 * Twee dingen houden hem op zijn plek zonder de rest te storen:
 *
 *   1. Hij staat op z-index -1 BINNEN .axe-shell. Daardoor schildert hij boven
 *      de glasachtergrond van de plaat maar onder de pagina-inhoud, en — omdat
 *      hij een kind van de schil is, niet erachter — vangt de backdrop-filter
 *      van de plaat hem niet. Hij ligt dus scherp óp het glas, net als in de
 *      demo, niet vervaagd erachter zoals de galaxy.
 *
 *   2. pointer-events:none. Als decor mag hij geen kliks van de pagina
 *      wegvangen; de OrbitControls van de bol krijgen zo vanzelf geen input,
 *      wat hier precies goed is.
 *
 * Home mount zijn eigen SphereStage (de interactieve bol die óók de
 * chat-projecties draagt). Daar zou deze ambient-kopie dubbelop staan, dus op
 * '/' — en op de kale mobiele command-surface — houdt hij zich stil.
 */
export function AxeShellSphere() {
  const location = useLocation();
  const pendingExec = useVoiceStore((s) => s.pendingExec);
  const voiceStatus = useVoiceStore((s) => s.voiceStatus);

  if (location.pathname === '/' || location.pathname === '/mobile') return null;

  // Dezelfde afleiding als Home, zodat de bol overal hetzelfde "humeur" toont.
  const status: CoreStatus = pendingExec
    ? 'awaiting-approval'
    : voiceStatus === 'listening'
      ? 'listening'
      : voiceStatus === 'processing'
        ? 'thinking'
        : voiceStatus === 'speaking'
          ? 'speaking'
          : 'idle';

  return (
    <div
      aria-hidden="true"
      className="axe-shell-sphere"
      style={{ position: 'absolute', inset: 0, zIndex: -1, pointerEvents: 'none' }}
    >
      <HolographicSphere status={status} />
    </div>
  );
}
