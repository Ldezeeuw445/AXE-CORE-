/**
 * Kopregel van het slot: zon/maan links, alleen de cyaan driehoek rechts.
 * Geen AXE CORE-woordmerk — de driehoek is het merkteken.
 */
import { LookToggle } from '@/presentation/components/layout/LookToggle';

export function LockChrome() {
  return (
    <div className="axe-lock-look flex items-center justify-between gap-3">
      <LookToggle />
      <span className="axe-lock-driehoek" role="img" aria-label="AXE CORE" />
    </div>
  );
}
