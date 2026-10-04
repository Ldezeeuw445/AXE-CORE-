/**
 * Twee voorkeuren die op elk apparaat hetzelfde horen te staan.
 *
 * ## Waarom dit nodig was
 *
 * Gemeten 4 okt 2026. `axe_look` en de modelkeuzes gaan al naar `user_settings`
 * en komen bij het inloggen terug (`hydrateSettingsFromSupabase`). Deze twee
 * stonden alleen in localStorage van het apparaat waarop je ze zette:
 *
 *   * `axe_response_mode` -- praat AXE terug of niet. Zet je hem op de telefoon
 *     op "alleen tekst", dan praat de Mac vrolijk door.
 *   * `axe_dynamic_nav_v1` -- tabs die THINKTHANKS registreert. Die bestonden
 *     alleen op het apparaat waar je de bron erin gooide: op je iPad was de tab
 *     er simpelweg niet, zonder dat iets dat zei.
 *
 * Dat is precies waar "het is één app" op stukloopt: dezelfde knop, drie
 * standen, en geen manier om te zien welke de echte is.
 *
 * ## Hoe het werkt
 *
 * De hydratie bij het inloggen schrijft élke rij uit `user_settings` naar
 * localStorage. Daarna hoeft hier niets meer over het netwerk: de cloudwaarden
 * STAAN er al. Vandaar het seintje uit AuthContext in plaats van een eigen
 * ophaalronde -- een tweede netwerkronde die hetzelfde ophaalt is een tweede
 * antwoord dat kan afwijken.
 *
 * De navigatielijst heeft geen vertaling nodig (lokaal is het al JSON, net als
 * wat de hydratie schrijft). De spraakstand wél, en waarom staat in
 * `domain/voorkeuren.ts`.
 */
import { loadDynamicNavItems } from '@/domain/navRegistry';
import { spraakStandUit } from '@/domain/voorkeuren';
import { saveSetting } from '@/infrastructure/persistence/userSettingsService';
import { useVoiceStore } from '@/presentation/store/voiceStore';

/** De rauwe sleutel die vier plekken synchroon lezen. Blijft van hen. */
const SPRAAK_LOKAAL = 'axe_response_mode';
/** Dezelfde stand, maar als JSON, voor user_settings en de hydratie. */
export const SPRAAK_CLOUD = 'axe_response_mode_sync';
/** Deze staat lokaal al als JSON, dus één sleutel volstaat. */
const NAV_SLEUTEL = 'axe_dynamic_nav_v1';

/** AuthContext zendt dit zodra user_settings in localStorage staat. */
export const INSTELLINGEN_BINNEN = 'axe-instellingen-binnen';

let geinstalleerd = false;

/** De stand uit de cloud overnemen, als er een is en hij afwijkt. */
function neemSpraakOver(): void {
  let ruw: string | null;
  try { ruw = localStorage.getItem(SPRAAK_CLOUD); } catch { return; }
  const stand = spraakStandUit(ruw);
  if (!stand) return;
  if (useVoiceStore.getState().responseMode === stand) return;
  // Allebei: de rauwe sleutel voor de vier synchrone lezers, en de store voor
  // wat er op het scherm staat. Eén van de twee is een stand die niet klopt.
  try { localStorage.setItem(SPRAAK_LOKAAL, stand); } catch { /* privémodus */ }
  useVoiceStore.setState({ responseMode: stand });
}

export function installVoorkeurSync(): void {
  if (geinstalleerd || typeof window === 'undefined') return;
  geinstalleerd = true;

  window.addEventListener(INSTELLINGEN_BINNEN, neemSpraakOver);

  // Lokale wijziging -> cloud. Via de store en niet via de setter, zodat elke
  // manier om de stand te wijzigen meetelt, ook een die er later bij komt.
  useVoiceStore.subscribe((nu, vorige) => {
    if (nu.responseMode === vorige.responseMode) return;
    void saveSetting(SPRAAK_CLOUD, nu.responseMode);
  });

  // Een tab die THINKTHANKS registreert, hoort op je andere apparaten ook te
  // bestaan. navRegistry zendt dit al; hij blijft zelf domain en raakt de
  // cloud niet aan.
  window.addEventListener('axe-nav-changed', () => {
    void saveSetting(NAV_SLEUTEL, loadDynamicNavItems());
  });
}
