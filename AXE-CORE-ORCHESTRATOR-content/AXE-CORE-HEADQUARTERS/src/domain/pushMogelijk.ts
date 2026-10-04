/**
 * Of dit apparaat meldingen kan ontvangen, en zo niet: waarom.
 *
 * ## Waarom dit een regel is en geen `if` in de knop
 *
 * "De knop doet niets" is in deze codebase al drie keer een bug geweest -- de
 * Skills-pil in een FAB die er niet was, vier dokknoppen die buiten Tauri
 * stilletjes gooiden, een chatvak dat leeg bleef zonder te zeggen waarom. Een
 * meldingenknop heeft vier manieren om niet te kunnen, en drie daarvan kan de
 * gebruiker zelf oplossen. Dan hoort er een reden te staan, geen grijze knop.
 *
 * Als regel hier is hij bovendien te toetsen zonder browser: de echte
 * omgevingen (iOS-Safari zonder installatie, de Tauri-app, een geweigerde
 * toestemming) zijn met de hand niet allemaal na te bootsen.
 */
export interface PushOmgeving {
  /** `'serviceWorker' in navigator` */
  serviceWorker: boolean;
  /** `'PushManager' in window` */
  pushManager: boolean;
  /** `Notification.permission`, of null als die er niet is. */
  toestemming: 'granted' | 'denied' | 'default' | null;
  /** Draait dit in de verpakte Tauri-app? */
  tauri: boolean;
  /** iOS/iPadOS geeft Web Push alleen aan een PWA op het beginscherm. */
  iosZonderInstallatie: boolean;
  /** Staat er een VAPID-sleutel in de bundel? */
  sleutel: boolean;
}

export type PushStand =
  /** Kan en mag: de knop meldt aan. */
  | { kan: true }
  /** Kan niet; `reden` is wat de gebruiker leest, `herstelbaar` of het aan hem ligt. */
  | { kan: false; reden: string; herstelbaar: boolean };

export function pushStand(o: PushOmgeving): PushStand {
  // Eerst wat de gebruiker zelf kan oplossen, want dat is het antwoord waar hij
  // iets aan heeft. Een "niet ondersteund" bovenaan zetten zou de iPhone een
  // doodlopend bericht geven terwijl installeren het oplost.
  if (o.iosZonderInstallatie) {
    return {
      kan: false,
      herstelbaar: true,
      reden: 'Op iPhone en iPad werkt dit alleen vanuit de geïnstalleerde app. Zet AXE eerst op je beginscherm (Deel → Zet op beginscherm) en open hem daar.',
    };
  }
  if (o.toestemming === 'denied') {
    return {
      kan: false,
      herstelbaar: true,
      reden: 'Je hebt meldingen eerder geweigerd. Dat kan alleen in de instellingen van je browser of telefoon weer aan.',
    };
  }
  if (o.tauri) {
    return {
      kan: false,
      herstelbaar: false,
      reden: 'De Mac-app heeft geen service worker. Meldingen lopen via de PWA op axeheadquarters.com en via je telefoon.',
    };
  }
  if (!o.serviceWorker || !o.pushManager || o.toestemming === null) {
    return {
      kan: false,
      herstelbaar: false,
      reden: 'Deze browser kan geen pushmeldingen ontvangen.',
    };
  }
  if (!o.sleutel) {
    return {
      kan: false,
      herstelbaar: false,
      reden: 'Er staat geen VAPID-sleutel in deze bouw. Zet VITE_VAPID_PUBLIC_KEY in de bouwomgeving.',
    };
  }
  return { kan: true };
}
