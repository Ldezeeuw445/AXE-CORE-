/**
 * Opslag en toepassing van "Maak het van jou" (domain/maakVanJou.ts).
 *
 * Eén sleutel, als JSON, in localStorage én user_settings: dezelfde app op de
 * iMac, de Mac mini en de telefoon. De hydratie bij het inloggen schrijft de
 * cloudwaarde al naar localStorage (zie installVoorkeurSync), dus bij het
 * seintje INSTELLINGEN_BINNEN hoeven we alleen opnieuw te lezen en toe te passen.
 */
import { useEffect, useState } from 'react';
import { KLEUREN, hexNaarRgb, leesVoorkeur, type Voorkeur } from '@/domain/maakVanJou';
import { saveSetting } from '@/infrastructure/persistence/userSettingsService';

export const MAAK_VAN_JOU_SLEUTEL = 'axe_maak_van_jou_v1';
const SEIN = 'axe-maak-van-jou';

export function leesMaakVanJou(): Voorkeur {
  try { return leesVoorkeur(localStorage.getItem(MAAK_VAN_JOU_SLEUTEL)); } catch { return { verborgen: [] }; }
}

function pasKleurToe(v: Voorkeur): void {
  if (typeof document === 'undefined') return;
  const root = document.documentElement.style;
  const hex = v.kleur ? KLEUREN[v.kleur] : undefined;
  if (hex) {
    root.setProperty('--accent-cyan', hex);
    root.setProperty('--accent-rgb', hexNaarRgb(hex));
  } else {
    root.removeProperty('--accent-cyan');
    root.removeProperty('--accent-rgb');
  }
}

export function schrijfMaakVanJou(v: Voorkeur): void {
  try { localStorage.setItem(MAAK_VAN_JOU_SLEUTEL, JSON.stringify(v)); } catch { /* privémodus */ }
  pasKleurToe(v);
  window.dispatchEvent(new Event(SEIN));
  void saveSetting(MAAK_VAN_JOU_SLEUTEL, v);
}

let geinstalleerd = false;
export function installMaakVanJou(): void {
  if (geinstalleerd || typeof window === 'undefined') return;
  geinstalleerd = true;
  pasKleurToe(leesMaakVanJou());
  window.addEventListener('axe-instellingen-binnen', () => {
    pasKleurToe(leesMaakVanJou());
    window.dispatchEvent(new Event(SEIN));
  });
}

/** De verborgen tab-paden, live bijgewerkt. */
export function useVerborgenTabs(): Set<string> {
  const [v, setV] = useState(() => new Set(leesMaakVanJou().verborgen));
  useEffect(() => {
    const op = () => setV(new Set(leesMaakVanJou().verborgen));
    window.addEventListener(SEIN, op);
    return () => window.removeEventListener(SEIN, op);
  }, []);
  return v;
}
