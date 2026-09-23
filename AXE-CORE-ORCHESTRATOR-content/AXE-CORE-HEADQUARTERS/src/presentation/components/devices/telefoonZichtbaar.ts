/**
 * Of de zwevende iPhone in beeld is.
 *
 * Standaard uit. Het telefoon-icoon in het radiaal dok linksonder zet hem aan
 * en uit -- dat is de enige knop, want de telefoon heeft geen kopbalk meer.
 * Onthouden in localStorage, en als gebeurtenis rondgestuurd zodat het dok en
 * de telefoon (die in verschillende delen van de schil hangen) elkaar volgen.
 */
import { useEffect, useState } from 'react';
import { bewaarVlag, laadVlag } from '@/presentation/components/layout/zweef/zweefPositie';

const NAAM = 'telefoon';
const VLAG = 'zichtbaar';
const GEBEURTENIS = 'axe:telefoon-zichtbaar';

export function telefoonZichtbaar(): boolean {
  return laadVlag(NAAM, VLAG, window.localStorage);
}

function zetTelefoon(aan: boolean): void {
  bewaarVlag(NAAM, VLAG, aan, window.localStorage);
  // Aanzetten begint op zijn vaste plek. Een oude plek (van de telefoon met
  // kopbalk, of van een groter venster) kon hem buiten beeld laten beginnen.
  if (aan) {
    try { window.localStorage.removeItem('axe_zwever_telefoon'); } catch { /* privémodus */ }
  }
  window.dispatchEvent(new CustomEvent(GEBEURTENIS, { detail: aan }));
}

export function wisselTelefoon(): void {
  zetTelefoon(!telefoonZichtbaar());
}

export function useTelefoonZichtbaar(): boolean {
  const [aan, setAan] = useState(telefoonZichtbaar);
  useEffect(() => {
    const bij = () => setAan(telefoonZichtbaar());
    window.addEventListener(GEBEURTENIS, bij);
    window.addEventListener('storage', bij);
    return () => { window.removeEventListener(GEBEURTENIS, bij); window.removeEventListener('storage', bij); };
  }, []);
  return aan;
}
