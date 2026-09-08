/**
 * Leest en zet de uiterlijke stand van de app.
 *
 * Zet `data-look` op <html>, waar design/axe-look.css op aanslaat. Bewaart de
 * keuze lokaal en in user_settings, zodat je Mac, het domein en je telefoon
 * hetzelfde staan.
 *
 * De lokale schrijfactie gebeurt meteen en apart van de cloud: als Supabase
 * traag is of weigert, is het scherm al om. Andersom -- eerst wachten op de
 * cloud -- gaf een knop die een halve seconde niets deed, en dan drukt iemand
 * nog een keer.
 */
import { useCallback, useEffect, useState } from 'react';
import { type Look, resolveLook, DEFAULT_LOOK } from '@/domain/look';
import { loadSetting, saveSetting } from '@/infrastructure/persistence/userSettingsService';

const KEY = 'axe_look';

/** Zet het attribuut waar de stylesheet op reageert. */
function apply(look: Look) {
  if (typeof document === 'undefined') return;
  document.documentElement.dataset.look = look;
  zetNativeGlas(look);
}

/**
 * Wisselt ook het glas ONDER de webview mee.
 *
 * De stylesheet kan alleen kleuren op de pagina zetten. De vervaging zelf komt
 * van een NSVisualEffectView buiten de webview, en die stond hard op HudWindow
 * -- altijd donker. De lichte stand legde daar licht overheen en werd daardoor
 * vaal: een bijna witte plaat waarop niets te lezen was, in plaats van matglas
 * met het bureaublad erdoorheen.
 *
 * Alleen in de Tauri-app; in een gewone browser bestaat dat glas niet en is
 * dit een stille no-op.
 */
function zetNativeGlas(look: Look) {
  const w = window as unknown as { __TAURI_INTERNALS__?: unknown };
  if (!w.__TAURI_INTERNALS__) return;
  void import('@tauri-apps/api/core')
    .then(({ invoke }) => invoke('zet_plaat_materiaal', { licht: look === 'glass' }))
    .catch(() => { /* geen glas beschikbaar -- de kleuren staan al goed */ });
}

/** Wat dit apparaat het laatst gebruikte, zonder op het netwerk te wachten. */
function readLocal(): unknown {
  try { return localStorage.getItem(KEY); } catch { return undefined; }
}

/**
 * Zet de stand meteen bij het opstarten, vóór React.
 *
 * Zonder dit ziet je eerste frame de standaardstand en klapt het scherm daarna
 * om -- een flits die er precies uitziet als een fout.
 */
export function applyStoredLookEarly() {
  apply(resolveLook({ local: readLocal() }));
}

export function useLook(): [Look, (next: Look) => void] {
  const [look, setLookState] = useState<Look>(() => resolveLook({ local: readLocal() }));

  useEffect(() => { apply(look); }, [look]);

  // De cloud kan de lokale keuze overrulen: wat je op een ander apparaat koos
  // hoort hier ook te gelden.
  useEffect(() => {
    let alive = true;
    void (async () => {
      const cloud = await loadSetting<string | null>(KEY, null);
      if (!alive) return;
      const resolved = resolveLook({ cloud, local: readLocal() });
      setLookState(resolved);
    })();
    return () => { alive = false; };
  }, []);

  const setLook = useCallback((next: Look) => {
    setLookState(next);
    apply(next);
    try { localStorage.setItem(KEY, next); } catch { /* private mode */ }
    void saveSetting(KEY, next);
  }, []);

  return [look, setLook];
}

export { DEFAULT_LOOK };
