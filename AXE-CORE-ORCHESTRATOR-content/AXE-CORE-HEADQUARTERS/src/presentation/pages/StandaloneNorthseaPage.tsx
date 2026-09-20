import { AxeAtmosphere } from '@/presentation/components/layout/AxeAtmosphere';
import { AxeShellChrome } from '@/presentation/components/layout/AxeShellChrome';
import { PlaatSlotHosts } from '@/presentation/components/layout/PlaatSlots';
import { PlaatChat } from '@/presentation/components/layout/PlaatChat';
import { AxePresenceDock } from '@/presentation/components/layout/AxePresenceDock';
import NorthseaDesk from '@/presentation/pages/northsea/NorthseaDesk';

export default function StandaloneNorthseaPage() {
  return (
    <>
      <AxeAtmosphere />
      <AxeShellChrome />
      <div className="axe-shell northsea-standalone-shell h-[100dvh] overflow-hidden" style={{ background: 'var(--bg-base)' }}>
        <PlaatSlotHosts />
        <div className="northsea-standalone-shell__top" data-tauri-drag-region>
          <strong>NORTHSEA</strong>
          <div id="axe-slot-topbalk" />
          <div className="flex-1" data-tauri-drag-region />
          <div id="axe-slot-topbalk-rechts" />
          <span>GLOBAL TRADE CENTER</span>
        </div>
        <main className="northsea-standalone-shell__main">
          <NorthseaDesk />
        </main>
        <PlaatChat />
        <AxePresenceDock />
      </div>
    </>
  );
}
