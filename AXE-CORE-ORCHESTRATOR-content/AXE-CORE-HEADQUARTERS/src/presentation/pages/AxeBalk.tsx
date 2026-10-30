/**
 * AxeBalk / AXE-notch — matzwart paneel hangend vanaf de bovenrand met gloeiend
 * AXE-avatar. Stands: collapsed / hover / expanded. Sidepanel met 6 tabs.
 * Werkt in eigen Tauri-venster `axe-balk` (ook als main verborgen is).
 */
import { useEffect, useState } from 'react';
import {
  kanVersturen,
  NOTCH_TABS,
  notchHoverActie,
  notchTabActie,
  notchToetsActie,
  type NotchActie,
  type NotchState,
  type NotchTab,
} from '@/domain/balk/balk';
import { showMainWindow } from '@/infrastructure/gateways/tauriShell';
import { isTauriRuntime } from '@/infrastructure/config/apiUrl';
import './AxeNotch.css';

async function zetStand(stand: NotchState): Promise<void> {
  if (!isTauriRuntime()) return;
  try {
    const { invoke } = await import('@tauri-apps/api/core');
    await invoke('notch_zet_stand', { stand });
  } catch {
    /* preview / ontbrekende command: UI blijft lokaal kloppen */
  }
}

function panelTekst(tab: NotchTab): { title: string; copy: string } {
  switch (tab) {
    case 'chat':
      return { title: 'Chat', copy: 'Vraag AXE iets. Bestanden slepen volgt in stap 2.' };
    case 'meldingen':
      return { title: 'Meldingen', copy: 'Goedkeuringen en alerts verschijnen hier.' };
    case 'agents':
      return { title: 'Agents / DAX', copy: 'Workers en DAX-bots. Status volgt via Device Manager.' };
    case 'northsea':
      return { title: 'NorthSea', copy: 'Commodity-desk en deal-flow, zonder live acties zonder ja.' };
    case 'trading':
      return { title: 'Trading', copy: 'Trading-desk overzicht. Autonomie blijft uit tot Luka ja zegt.' };
    default:
      return { title: 'Home', copy: 'Opent de AXE CORE shell.' };
  }
}

export default function AxeBalk() {
  const [stand, setStand] = useState<NotchState>('collapsed');
  const [openTab, setOpenTab] = useState<NotchTab | null>('chat');
  const [vraag, setVraag] = useState('');

  const pasStandToe = (next: NotchState) => {
    setStand(next);
    void zetStand(next);
  };

  const voerUit = (actie: NotchActie) => {
    if (actie.soort === 'open-hoofdvenster') {
      void showMainWindow();
      return;
    }
    if (actie.soort === 'zet-stand') {
      if (actie.stand !== 'expanded') setOpenTab(null);
      pasStandToe(actie.stand);
      return;
    }
    setOpenTab(actie.tab);
    pasStandToe('expanded');
  };

  useEffect(() => {
    const opToets = (e: KeyboardEvent) => {
      const actie = notchToetsActie(e.key, stand);
      if (actie) voerUit(actie);
    };
    window.addEventListener('keydown', opToets);
    return () => window.removeEventListener('keydown', opToets);
  }, [stand]);

  useEffect(() => {
    // Luister naar Rust-sneltoets: event zet expanded/collapsed.
    if (!isTauriRuntime()) return;
    let unlisten: (() => void) | undefined;
    void (async () => {
      try {
        const { listen } = await import('@tauri-apps/api/event');
        unlisten = await listen<NotchState>('axe://notch-stand', (ev) => {
          const next = ev.payload;
          setStand(next);
          if (next !== 'expanded') setOpenTab(null);
          else if (!openTab) setOpenTab('chat');
        });
      } catch {
        /* geen tauri event bridge in browser-preview */
      }
    })();
    return () => unlisten?.();
  }, [openTab]);

  if (stand === 'hidden') {
    return <div className="axe-notch-root" aria-hidden="true" />;
  }

  const klasse =
    stand === 'expanded'
      ? 'axe-notch--expanded'
      : stand === 'hover'
        ? 'axe-notch--hover'
        : 'axe-notch--collapsed';

  const actief = openTab ?? 'chat';
  const panel = panelTekst(actief);

  return (
    <div className="axe-notch-root">
      <div
        className={`axe-notch ${klasse}`}
        onMouseEnter={() => {
          const next = notchHoverActie(stand, true);
          if (next !== stand) pasStandToe(next);
        }}
        onMouseLeave={() => {
          const next = notchHoverActie(stand, false);
          if (next !== stand) pasStandToe(next);
        }}
      >
        <div
          className="axe-notch__cap"
          data-tauri-drag-region
          role="button"
          tabIndex={0}
          aria-label={stand === 'expanded' ? 'AXE notch inklappen' : 'AXE notch uitklappen'}
          onClick={() => pasStandToe(stand === 'expanded' ? 'collapsed' : 'expanded')}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              pasStandToe(stand === 'expanded' ? 'collapsed' : 'expanded');
            }
          }}
        >
          <span className="axe-notch__avatar-wrap" data-tauri-drag-region>
            <span className="axe-notch__glow" aria-hidden="true" />
            <img
              className="axe-notch__avatar"
              src="/axe-notch-avatar.png"
              alt="AXE"
              data-tauri-drag-region
            />
          </span>
          {stand === 'hover' && <span className="axe-notch__hint">AXE</span>}
        </div>

        {stand === 'expanded' && (
          <div className="axe-notch__body">
            <nav className="axe-notch__side" aria-label="AXE notch tabs">
              {NOTCH_TABS.map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  className="axe-notch__tab"
                  aria-pressed={actief === tab.id}
                  onClick={() => voerUit(notchTabActie(tab.id, openTab, stand))}
                >
                  {tab.label}
                </button>
              ))}
            </nav>
            <div className="axe-notch__panel">
              <div className="axe-notch__panel-title">{panel.title}</div>
              <div className="axe-notch__panel-copy">{panel.copy}</div>
              {actief === 'chat' && (
                <form
                  className="axe-notch__input-row"
                  onSubmit={(e) => {
                    e.preventDefault();
                    if (!kanVersturen(vraag, [])) return;
                    /* orchestrator-antwoord volgt in stap 2 */
                  }}
                >
                  <input
                    value={vraag}
                    onChange={(e) => setVraag(e.target.value)}
                    placeholder="Vraag AXE iets…"
                    aria-label="Vraag aan AXE"
                  />
                  <button type="submit" className="axe-notch__send" disabled={!kanVersturen(vraag, [])}>
                    ↑
                  </button>
                </form>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
