/**
 * useKeyboardShortcuts.ts
 * ------------------------------------------------------------------
 * De sneltoetsen van het venster:
 * - ⌥Space = microfoon aan/uit, op ELKE tab (web en PWA)
 * - Spatie op Home = hetzelfde, zonder modifier
 * - Cmd/Ctrl + letter = naar een tab
 *
 * ## Waarom de mic-tak hier opnieuw geschreven is (1 okt 2026)
 *
 * In de kop stond "Spacebar on Home = toggle microphone", en dat deed hij niet.
 * De tak hing aan een `onSpacebar`-prop, en `App.tsx` riep de hook aan als
 * `useKeyboardShortcuts({})` -- zonder handler. Dus de enige toetsweg naar de
 * microfoon in de web-app en de PWA was dood, op elke tab, al die tijd.
 *
 * En zelfs levend was hij beperkt tot Home. Bouwlijst 6.8 noemt dat ook als het
 * laatste gat in de stem-fase: "globale hotkey om de mic van overal te openen".
 * In Tauri bestaat die wel -- Rust registreert ⌥Space, zie src-tauri/src/lib.rs
 * -- maar een browser kan geen toets afvangen buiten zijn eigen venster, dus
 * daar is dit het dichtste wat bestaat: dezelfde aanslag, op elke tab, zolang
 * het venster focus heeft.
 *
 * De beslissing zelf staat in `domain/voice/sneltoets.ts` en is getest, inclusief
 * de reden dat het venster in Tauri juist NIET mag meedoen: Rust vangt dezelfde
 * aanslag al af, en twee schakelaars op één druk is openen en meteen weer sluiten.
 */

import { useEffect, useCallback } from 'react';
import { useNavigate, useLocation } from 'react-router';
import { opentMicVanuitVenster } from '@/domain/voice/sneltoets';
import { isTauriRuntime } from '@/infrastructure/config/apiUrl';
import { schakelStemSneltoets } from '@/presentation/store/installOpenAIRealtimeVoice';

/** Tab shortcuts — Cmd/Ctrl + key → route */
const TAB_SHORTCUTS: Record<string, string> = {
  h: '/',
  a: '/ai-core',
  m: '/memory',
  k: '/knowledge',
  p: '/mcp',
  i: '/infrastructure',
  c: '/control-plane',
  // Was '/command': die route bestaat niet meer, dus `t` navigeerde naar
  // niets -- je drukt, er gebeurt niks, en er is geen fout om op te zoeken.
  // `t` van terminals, de route die er wél is. navBereikbaar.test.ts houdt
  // nu elke sneltoets tegen de routes van App.tsx aan.
  t: '/terminals',
  d: '/developer',
  s: '/settings',
  g: '/crewai',
  f: '/finance',
  r: '/trading',
  e: '/code-editor',
  v: '/eve',
  b: '/browser',
  n: '/maps-3d',
  u: '/computer-use',
};

export function useKeyboardShortcuts({
  onSpacebar,
}: {
  /** Alleen nog voor een scherm dat de spatie zelf wil afhandelen. Blijft hij
   *  leeg -- en dat doet App.tsx -- dan gaat de mic-tak naar de stemlus. */
  onSpacebar?: () => void;
} = {}) {
  const navigate = useNavigate();
  const location = useLocation();
  const isHome = location.pathname === '/' || location.pathname === '';

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      const doel = e.target as HTMLElement | null;
      const tag = doel?.tagName?.toLowerCase();
      const inVeld = tag === 'input' || tag === 'textarea' || tag === 'select'
        || !!doel?.isContentEditable;

      if (
        opentMicVanuitVenster(
          {
            code: e.code,
            alt: e.altKey,
            ctrl: e.ctrlKey,
            shift: e.shiftKey,
            meta: e.metaKey,
            inVeld,
          },
          { opHome: isHome, inTauri: isTauriRuntime() },
        )
      ) {
        e.preventDefault();
        if (onSpacebar) onSpacebar();
        else schakelStemSneltoets();
        return;
      }

      // Typen gaat voor bij alles hieronder.
      if (inVeld) return;

      // Cmd/Ctrl + letter = tab navigation
      if ((e.metaKey || e.ctrlKey) && !e.shiftKey && !e.altKey) {
        const key = e.key.toLowerCase();
        const path = TAB_SHORTCUTS[key];
        if (path) {
          e.preventDefault();
          navigate(path);
        }
      }
    },
    [navigate, isHome, onSpacebar]
  );

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);
}
