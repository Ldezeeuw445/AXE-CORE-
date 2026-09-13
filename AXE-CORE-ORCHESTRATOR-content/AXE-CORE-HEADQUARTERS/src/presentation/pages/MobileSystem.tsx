/**
 * MobileSystem — de mobiele home van AXE CORE (`/#/mobile`).
 *
 * Dit is het scherm waar de Samsung-APK op opent, en het is de basis net als de
 * Tauri-home: de plaat met wallpaper (MobileGlass), de AXE-sphere in het midden,
 * en de composer onderaan. De glance (klok, wat wacht, algo) staat niet meer
 * hier maar op het lock screen — dat is waar je "wat wil ik snel zien" hoort.
 * Navigatie naar alle tabs zit in de lade van links (MobileNav), niet als grid
 * op deze pagina; dat scheelt ruimte en haalt de dubbeling weg.
 *
 * De pagina rendert zijn eigen volledige inhoud, dus hij werkt op de
 * command-surface van de Android-shell (waar de desktop-chrome verborgen is) —
 * anders dan Home, dat zijn inhoud in de plaat-slots heeft en daar leeg blijft.
 */
import { AxeCoreSphere } from '@/presentation/components/axe-core/sphere/AxeCoreSphere';
import { MobileGlass, LookToggle } from '@/presentation/components/layout/MobileGlass';
import { MobileComposer } from '@/presentation/components/layout/MobileComposer';

export default function MobileSystem() {
  return (
    <div className="relative flex h-full min-h-0 w-full flex-col overflow-hidden">
      <MobileGlass />
      <div className="relative z-[1] mx-auto flex h-full w-full max-w-md flex-col px-4 pb-4 pt-2">
        {/* Zon/maan rechtsboven; de hamburger van de lade staat links (AppShell). */}
        <div className="flex flex-none justify-end pt-1">
          <LookToggle />
        </div>
        {/* De sphere vult het midden, net als op de Tauri-home. Sleep om te draaien. */}
        <div className="relative min-h-0 flex-1">
          <AxeCoreSphere />
        </div>
        <MobileComposer />
      </div>
    </div>
  );
}
