/**
 * De data van één NorthSea-tabblad, met laden, fout en verversen.
 *
 * Zoals de desk zelf (NorthseaDesk.tsx): de eerste keer een tik uitgesteld, daarna
 * elke minuut zolang het venster zichtbaar is, en `ververs()` haalt hem vers (de
 * backend slaat dan zijn cache van 30 s over).
 *
 * Elk tabblad heeft zijn eigen instantie met een vaste naam, dus een antwoord kan
 * nooit bij een ander tabblad terechtkomen. Wat wel kan: het tabblad sluit terwijl
 * een verzoek loopt. `weg` voorkomt dan dat een losgekoppelde component state zet.
 *
 * Faalt het ophalen, dan blijft de laatste goede data staan en staat de fout
 * ernaast: een tabblad dat even geen verbinding heeft, wordt niet ineens leeg.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { northseaTab } from '@/infrastructure/gateways/axeCoreApiService';
import type { TabData, TabNaam } from '@/domain/northsea/tabs/typen';

const VERVERS_MS = 60_000;

export interface TabStaat<T extends TabNaam> {
  data: TabData[T] | null;
  fout: string | null;
  bezig: boolean;
  ververs: () => void;
}

function foutTekst(e: unknown): string {
  const t = e instanceof Error ? e.message : String(e);
  // Een lokale API van vóór deze tabbladen kent de route niet.
  if (/\b404\b|not found/i.test(t)) return 'This tab needs the updated local AXE API (restart AXE CORE after updating).';
  return t;
}

export function useNorthseaTab<T extends TabNaam>(naam: T): TabStaat<T> {
  const [data, setData] = useState<TabData[T] | null>(null);
  const [fout, setFout] = useState<string | null>(null);
  const [bezig, setBezig] = useState(false);
  const weg = useRef(false);

  const haal = useCallback(async (vers: boolean) => {
    setBezig(true);
    try {
      const d = await northseaTab(naam, vers);
      if (!weg.current) { setData(d); setFout(null); }
    } catch (e) {
      if (!weg.current) setFout(foutTekst(e));
    } finally {
      if (!weg.current) setBezig(false);
    }
  }, [naam]);

  useEffect(() => {
    weg.current = false;
    const eerste = setTimeout(() => { void haal(false); }, 0);
    const t = setInterval(() => { if (!document.hidden) void haal(false); }, VERVERS_MS);
    return () => { weg.current = true; clearTimeout(eerste); clearInterval(t); };
  }, [haal]);

  const ververs = useCallback(() => { void haal(true); }, [haal]);
  return { data, fout, bezig, ververs };
}
