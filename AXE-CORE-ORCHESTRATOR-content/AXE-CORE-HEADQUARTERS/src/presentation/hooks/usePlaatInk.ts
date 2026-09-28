/**
 * usePlaatInk / useLookValue — de look lezen, gedeeld over componenten.
 *
 * `useLook` houdt per component eigen state: zet je de stand in de ene knop, dan
 * weet een andere component daar niets van. Wat wél overal verandert is het
 * `data-look`-attribuut op <html> (useLook.apply zet dat). `useLookValue` leest
 * dat attribuut en volgt het via een MutationObserver, zodat elke mobiele
 * component meeschakelt zodra de stand ergens wisselt — ongeacht wélke knop.
 *
 * `usePlaatInk` geeft de inkt voor tekst die DIRECT op de plaat ligt (klok,
 * datum, sectiekoppen): donker op een écht lichte plaat, licht op een donkere.
 * Wat op een donkere kaart staat houdt gewoon `--text-primary`; die AXE-regel
 * geldt hier niet.
 *
 * Let op: op de telefoon is de "lichte" stand ('glass') sinds de Glass-Plate-
 * mockup GLAS DONKER — een diep indigo glas, dus donker. Alleen op de macOS-
 * desktop is 'glass' het native, écht lichte glas. Daarom hangt de donkere inkt
 * aan `hasNativeGlass()`, niet aan de stand alleen.
 */
import { useEffect, useState } from 'react';
import { type Look, DEFAULT_LOOK } from '@/domain/look';
import { hasNativeGlass } from '@/infrastructure/config/apiUrl';

function readLook(): Look {
  if (typeof document !== 'undefined') {
    const d = document.documentElement.dataset.look;
    if (d === 'glass' || d === 'black') return d;
  }
  return DEFAULT_LOOK;
}

export function useLookValue(): Look {
  const [look, setLook] = useState<Look>(readLook);
  useEffect(() => {
    const el = document.documentElement;
    const sync = () => setLook(readLook());
    const obs = new MutationObserver(sync);
    obs.observe(el, { attributes: true, attributeFilter: ['data-look'] });
    sync(); // stand kan tussen render en effect al zijn gewisseld
    return () => obs.disconnect();
  }, []);
  return look;
}

export function usePlaatInk(): { ink: string; muted: string } {
  const look = useLookValue();
  // Donkere inkt hoort alleen op een écht lichte plaat: dat is de macOS-desktop
  // met native glas. Op de telefoon is 'glass' = GLAS DONKER (indigo, donker),
  // dus daar blijft de inkt licht — net als in de zwarte stand.
  return look === 'glass' && hasNativeGlass()
    ? { ink: '#1b2432', muted: 'rgba(27,36,50,0.60)' }
    : { ink: 'var(--text-primary)', muted: 'var(--text-muted)' };
}
