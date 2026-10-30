/**
 * AxeBalk — de zwevende balk bovenaan het scherm, in AXE-stijl (matzwart
 * charcoal, AXE-logo). Stap 1 van de spec: tabs, invoer, uit/inklappen.
 * Bestanden slepen en het antwoord van de orchestrator komen in de volgende stap.
 */
import { useEffect, useState } from 'react';
import { balkTabActie, balkToetsActie, kanVersturen, type BalkActie, type BalkTab } from '@/domain/balk/balk';
import { showMainWindow } from '@/infrastructure/gateways/tauriShell';
import { isTauriRuntime } from '@/infrastructure/config/apiUrl';

async function zetUitgeklapt(open: boolean): Promise<void> {
  if (!isTauriRuntime()) return;
  try {
    const { invoke } = await import('@tauri-apps/api/core');
    await invoke('balk_uitklappen', { open });
  } catch {
    /* balk blijft dan gewoon in de huidige stand */
  }
}

export default function AxeBalk() {
  const [openTab, setOpenTab] = useState<BalkTab | null>(null);
  const [vraag, setVraag] = useState('');

  const voerUit = (actie: BalkActie) => {
    if (actie.soort === 'open-hoofdvenster') {
      void showMainWindow();
      return;
    }
    const open = actie.soort === 'uitklappen';
    setOpenTab(open ? actie.tab : null);
    void zetUitgeklapt(open);
  };

  useEffect(() => {
    const opToets = (e: KeyboardEvent) => {
      const actie = balkToetsActie(e.key);
      if (actie) voerUit(actie);
    };
    window.addEventListener('keydown', opToets);
    return () => window.removeEventListener('keydown', opToets);
  }, []);

  const tab = (naam: BalkTab, label: string) => (
    <button
      type="button"
      aria-pressed={openTab === naam}
      onClick={() => voerUit(balkTabActie(naam, openTab))}
      className="rounded-full px-3 py-1 text-xs text-white/80 hover:bg-white/10 aria-pressed:bg-white/15"
    >
      {label}
    </button>
  );

  return (
    <div className="flex h-full flex-col overflow-hidden rounded-2xl border border-white/10 bg-[#141416]/95 text-white shadow-2xl">
      <div data-tauri-drag-region className="flex h-14 shrink-0 items-center gap-2 px-3">
        <img src="/favicon.svg" alt="AXE" className="h-7 w-7" data-tauri-drag-region />
        {tab('home', 'Home')}
        {tab('chat', 'Chat')}
        {tab('plus', '+')}
        <form
          className="ml-2 flex-1"
          onSubmit={(e) => {
            e.preventDefault();
            if (!kanVersturen(vraag, [])) return;
            voerUit({ soort: 'uitklappen', tab: 'chat' });
          }}
        >
          <input
            value={vraag}
            onChange={(e) => setVraag(e.target.value)}
            placeholder="Vraag AXE iets…"
            className="w-full rounded-full bg-white/5 px-4 py-1.5 text-sm outline-none placeholder:text-white/40"
          />
        </form>
      </div>
      {openTab && (
        <div className="flex-1 border-t border-white/10 p-4 text-sm text-white/70">
          {openTab === 'plus' ? 'Sleep hier een bestand heen (volgt in stap 2).' : 'Antwoord van AXE verschijnt hier.'}
        </div>
      )}
    </div>
  );
}
