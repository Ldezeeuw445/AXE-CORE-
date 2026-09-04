/**
 * Staat dit venster op de voorgrond?
 *
 * ## Waarom dit bestaat
 *
 * Geen enkele scene in AXE had een rem. Neural, Terrain en Architecture
 * renderen alle drie op 60 fps mét Bloom-postprocessing, en ze bleven dat doen
 * als je het venster wegklikte of naar een andere app ging. Dat is de duurste
 * ding dat de app doet, en het gebeurde precies op het moment dat niemand keek.
 *
 * `document.hidden` dekt het geval dat we willen dekken: venster geminimaliseerd,
 * naar een ander tabblad, of het scherm op slot. Het dekt NIET "half achter een
 * ander venster" -- daar bestaat geen betrouwbaar signaal voor, en gokken zou
 * betekenen dat we soms stoppen terwijl je wel kijkt. Dat is de verkeerde fout.
 *
 * Voor react-three-fiber vertaalt dit naar `frameloop`: 'always' als je kijkt,
 * 'never' als je weg bent. De scene blijft bestaan -- alleen het tekenen stopt,
 * dus je komt terug in exact dezelfde staat zonder herbouw-hapering.
 */
import { useEffect, useState } from 'react';

export function useVensterZichtbaar(): boolean {
  const [zichtbaar, setZichtbaar] = useState(
    () => (typeof document === 'undefined' ? true : !document.hidden),
  );

  useEffect(() => {
    const kijk = () => setZichtbaar(!document.hidden);
    document.addEventListener('visibilitychange', kijk);
    return () => document.removeEventListener('visibilitychange', kijk);
  }, []);

  return zichtbaar;
}

/** Wat je aan een react-three-fiber `<Canvas frameloop={...}>` geeft. */
export function useFrameloop(): 'always' | 'never' {
  return useVensterZichtbaar() ? 'always' : 'never';
}
