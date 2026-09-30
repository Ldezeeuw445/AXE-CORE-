/**
 * Eén plek die weet of de AXE-backend draait, en één poller die het vraagt.
 *
 * Hiervoor deden vier schermen het zelf: de zijbalk, Home, de telefoon-Home en
 * Settings' motorenpaneel. Elk een eigen `useEffect`, elk een eigen interval
 * van 60 s, elk een eigen terugval. Ze tikten niet gelijk, dus op de desktop
 * -- waar Home en de zijbalk tegelijk aan staan -- ging dezelfde vraag twee
 * keer per minuut de deur uit op verschillende momenten, met twee antwoorden
 * die tot een minuut uit de pas konden lopen.
 *
 * De regel (wanneer is het online, offline of gewoon onbekend) staat in
 * `domain/coreStand.ts`. Deze store doet alleen bijhouden; `installCoreStatus`
 * doet het vragen.
 */
import { create } from 'zustand';
import type { AxeCoreRuntimeStatus } from '@/infrastructure/gateways/axeCoreApiService';
import { coreStand, type CoreMeting } from '@/domain/coreStand';
import type { ServiceStatus } from '@/domain/serviceStatus';
import { useNow } from '@/presentation/components/agents/useAgentActivity';

interface CoreStatusShape extends CoreMeting {
  /** De volle status van de laatste geslaagde meting; Settings toont er meer uit. */
  status: AxeCoreRuntimeStatus | null;
  /** Wanneer een meting slaagde. */
  gelukt: (status: AxeCoreRuntimeStatus) => void;
  /** Wanneer een meting niet eens antwoordde. */
  mislukt: () => void;
  zetBezig: (bezig: boolean) => void;
}

export const useCoreStatusStore = create<CoreStatusShape>((set) => ({
  online: null,
  laatsteOkAt: null,
  bezig: false,
  status: null,
  gelukt: (status) => set({
    status,
    online: status.online,
    laatsteOkAt: Date.now(),
    bezig: false,
  }),
  // Een mislukte aanroep is geen meting: `laatsteOkAt` blijft staan, zodat
  // coreStand zelf beslist wanneer de oude meting te oud wordt. Zou hij hier
  // meteen op offline gaan, dan flikkert één trage ronde het scherm rood.
  mislukt: () => set({ bezig: false }),
  zetBezig: (bezig) => set({ bezig }),
}));

/**
 * De stand, in het vocabulaire van de andere diensten.
 *
 * Met een eigen klok (`useNow`, dezelfde die de Agents-tab gebruikt) en niet
 * met `Date.now()` tijdens de render. Twee redenen, en de tweede is de echte:
 * het is onzuiver -- en het werkte niet. Verouderen gebeurt juist als er GEEN
 * metingen meer binnenkomen, en dan verandert de store dus niet, dus rendert
 * niemand opnieuw, dus bleef "online" eeuwig staan. Een tik per 30 s laat de
 * stand vanzelf naar `unknown` zakken zodra de backend stilvalt.
 */
function useCoreStand(): ServiceStatus {
  // Drie losse selectors en geen object: een selector die elke render een nieuw
  // object teruggeeft, is voor zustand elke keer een andere waarde.
  const online = useCoreStatusStore((s) => s.online);
  const laatsteOkAt = useCoreStatusStore((s) => s.laatsteOkAt);
  const bezig = useCoreStatusStore((s) => s.bezig);
  const nu = useNow(30_000);
  return coreStand({ online, laatsteOkAt, bezig }, nu);
}

/**
 * Draait hij? `null` als er niets (vers) gemeten is.
 *
 * Deze drieledige vorm is precies wat de vier schermen zelf bijhielden als
 * `useState<boolean | null>`, dus hun bestaande `=== true` / `=== false`-
 * vergelijkingen blijven kloppen -- alleen komt het antwoord nu overal
 * vandaan.
 */
export function useCoreOnline(): boolean | null {
  const stand = useCoreStand();
  return stand === 'unknown' ? null : stand === 'online';
}
