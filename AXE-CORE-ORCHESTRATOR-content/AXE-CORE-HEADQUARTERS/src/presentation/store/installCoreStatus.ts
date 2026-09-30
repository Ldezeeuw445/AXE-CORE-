/**
 * De enige poller op `/status/axe-core`.
 *
 * Eén keer aangezet in `main.tsx`, naast de andere installers. Elk scherm dat
 * wil weten of de backend draait leest `useCoreStatusStore` -- geen eigen
 * `useEffect` meer, en daarmee geen twee antwoorden meer.
 *
 * Slaat een ronde over als het venster verborgen is, en meet meteen opnieuw
 * zodra je terugklikt. Zonder dat laatste kijk je na het wisselen van app tot
 * een minuut naar een stand van voor je wegging -- dezelfde reden waarom
 * `useAgentActivity` het ook zo doet.
 */
import { axeCoreRuntimeStatus } from '@/infrastructure/gateways/axeCoreApiService';
import { useCoreStatusStore } from '@/presentation/store/coreStatusStore';

/** Zelfde ritme als de vier losse pollers hadden. */
const POLL_MS = 60_000;

let gestart = false;

export function installCoreStatus(): void {
  // main.tsx kan in ontwikkeling twee keer draaien (StrictMode, hot reload);
  // een tweede interval zou de winst van dit bestand meteen ongedaan maken.
  if (gestart) return;
  gestart = true;

  let bezig = false;
  const meet = async () => {
    if (bezig || document.visibilityState === 'hidden') return;
    bezig = true;
    useCoreStatusStore.getState().zetBezig(true);
    try {
      useCoreStatusStore.getState().gelukt(await axeCoreRuntimeStatus());
    } catch {
      useCoreStatusStore.getState().mislukt();
    } finally {
      bezig = false;
    }
  };

  void meet();
  window.setInterval(() => void meet(), POLL_MS);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') void meet();
  });
}
