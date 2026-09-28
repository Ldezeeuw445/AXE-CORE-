/**
 * De zijsloten op de telefoon: in de laden, niet naast de plaat.
 *
 * Op de desktop zet de schil `#axe-slot-links` en `#axe-slot-rechts` naast de
 * plaat (PlaatSlotHosts), en Neural en Terrain hangen daar hun widgets in --
 * Terrain via een portal (PlaatSlot), Neural door zijn eigen kolommen erheen te
 * verhuizen (useSlotAdoptie). Op de telefoon rendert de schil die gastheren
 * niet: er is geen ruimte naast de plaat. Terrain's widgets verdwenen daardoor,
 * die van Neural bleven in het beeld gepropt.
 *
 * Hier krijgen ze op de telefoon dezelfde twee gastheren, met dezelfde id's,
 * zodat Neural en Terrain niets hoeven te weten: links schuift mee in de
 * linkerlade, rechts in de rechterlade (Luka, 28 sep).
 *
 * ## Waarom geparkeerd en niet gewoon ín de lade
 *
 * De laden zijn een Radix-Sheet: dicht is de inhoud weg uit de pagina. Een
 * gastheer die daar in stond zou bij elke keer sluiten verdwijnen, en de
 * kolommen die Neural erin had verhuisd met hem. Daarom bestaan de gastheren
 * los van React, verborgen in een parkeerplaats, en schuift `LadeSlot` ze de
 * lade in zolang die open is -- en bij het sluiten weer terug. Het element
 * blijft hetzelfde, dus portals en verhuisde kolommen blijven gewoon werken.
 */
import { useLayoutEffect } from 'react';
import { SLOT_ID } from '@/presentation/components/layout/PlaatSlots';

export type LadeNaam = 'links' | 'rechts';

const PARKEER_ID = 'axe-lade-parkeer';

function parkeerplaats(): HTMLElement {
  let p = document.getElementById(PARKEER_ID);
  if (!p) {
    p = document.createElement('div');
    p.id = PARKEER_ID;
    p.hidden = true;
    document.body.appendChild(p);
  }
  return p;
}

/**
 * Zet de twee gastheren neer zolang de telefoonstand geldt. Layout-effect, zodat
 * ze er staan voordat een pagina in haar eigen effecten naar ze zoekt.
 * Bestaat er al een gastheer met dat id (de desktopschil), dan blijft die van
 * hem: twee elementen met één id is precies de fout die je niet wilt.
 */
export function useLadeSloten(actief: boolean): void {
  useLayoutEffect(() => {
    if (!actief) return;
    const p = parkeerplaats();
    const gemaakt: HTMLElement[] = [];
    for (const naam of ['links', 'rechts'] as const) {
      if (document.getElementById(SLOT_ID[naam])) continue;
      const el = document.createElement('div');
      el.id = SLOT_ID[naam];
      el.className = 'axe-slot axe-slot--lade';
      el.dataset.lade = naam;
      p.appendChild(el);
      gemaakt.push(el);
    }
    return () => {
      for (const el of gemaakt) {
        // Gemarkeerd, zodat een lade die daarna sluit hem niet terugparkeert.
        el.dataset.opgeruimd = '1';
        el.remove();
      }
      if (!p.childElementCount) p.remove();
    };
  }, [actief]);
}

/**
 * Zet een gastheer terug op de parkeerplaats, tenzij hij al is opgeruimd omdat
 * de telefoonstand eindigde. Voor LadeSlot, als de lade sluit.
 */
export function terugNaarParkeerplaats(gastheer: HTMLElement): void {
  if (gastheer.dataset.opgeruimd) return;
  parkeerplaats().appendChild(gastheer);
}
