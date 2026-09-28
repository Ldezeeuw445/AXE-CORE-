/**
 * Of de zwevende bol in beeld is. Standaard uit; de cyaan driehoek in het
 * radiaal dok linksonder zet hem aan en uit. Zelfde vorm als de telefoon
 * (devices/telefoonZichtbaar.ts): localStorage plus een gebeurtenis, omdat het
 * dok en de bol in verschillende delen van de schil hangen.
 */
import { useEffect, useState } from 'react';
import { bewaarVlag, laadVlag } from './zweefPositie';

const NAAM = 'bol';
const VLAG = 'zichtbaar';
const GEBEURTENIS = 'axe:bol-zichtbaar';

export function bolZichtbaar(): boolean {
  return laadVlag(NAAM, VLAG, window.localStorage);
}

export function wisselBol(): void {
  const aan = !bolZichtbaar();
  bewaarVlag(NAAM, VLAG, aan, window.localStorage);
  // Aanzetten begint op de vaste plek; een oude plek (van de bol met HUD-chip,
  // of van een groter venster) kon hem buiten beeld laten beginnen.
  if (aan) {
    try { window.localStorage.removeItem('axe_zwever_bol'); } catch { /* privémodus */ }
  }
  window.dispatchEvent(new CustomEvent(GEBEURTENIS, { detail: aan }));
}

export function useBolZichtbaar(): boolean {
  const [aan, setAan] = useState(bolZichtbaar);
  useEffect(() => {
    const bij = () => setAan(bolZichtbaar());
    window.addEventListener(GEBEURTENIS, bij);
    window.addEventListener('storage', bij);
    return () => { window.removeEventListener(GEBEURTENIS, bij); window.removeEventListener('storage', bij); };
  }, []);
  return aan;
}
