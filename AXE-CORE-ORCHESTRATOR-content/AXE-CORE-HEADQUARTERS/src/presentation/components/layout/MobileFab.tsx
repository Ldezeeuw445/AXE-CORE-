/**
 * MobileFab — de slimme hoekknop voor de telefoon.
 *
 * Op de desktop-Tauri zitten twee radiale hoekmenu's; op een telefoon dekt je
 * duim die af en passen waaiers slecht. Dit is de mobiel-eigen vervanging: één
 * knop rechtsonder (duim-bereik) die de handigste on-the-go-acties openklapt —
 * nieuw gesprek, spraak, en direct naar trading. Geen 1-op-1 kopie van de
 * desktop, wel hetzelfde doel: snel bij wat je onderweg nodig hebt.
 *
 * Hij hergebruikt de bestaande verbindingen (voiceStore, router); er wordt niets
 * nieuws gebouwd achter de knoppen.
 */
import { useState } from 'react';
import { useNavigate } from 'react-router';
import { Plus, X, Mic, MessageSquarePlus, LineChart } from 'lucide-react';
import { useVoiceStore } from '@/presentation/store/voiceStore';

export function MobileFab() {
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();
  const startListening = useVoiceStore((s) => s.startListening);
  const clearConversation = useVoiceStore((s) => s.clearConversation);

  const act = (fn: () => void) => { fn(); setOpen(false); };

  const actions = [
    { icon: MessageSquarePlus, label: 'Nieuw gesprek', run: () => clearConversation() },
    { icon: Mic, label: 'Spraak', run: () => { void startListening(); } },
    { icon: LineChart, label: 'Trading', run: () => navigate('/trading-intel') },
  ];

  return (
    // Boven de composer, rechts — buiten de composer-hoogte zodat hij de
    // verzendknop niet raakt.
    <div className="fixed right-3 z-[75] flex flex-col items-end gap-2" style={{ bottom: 'calc(env(safe-area-inset-bottom, 0px) + 92px)' }}>
      {open && actions.map((a) => (
        <button
          key={a.label}
          type="button"
          onClick={() => act(a.run)}
          className="flex items-center gap-2 rounded-full py-2 pl-3 pr-3 text-[12px] font-medium shadow-lg active:scale-95"
          style={{ background: 'var(--surface-bg)', border: '1px solid var(--border-subtle)', color: 'var(--text-primary)' }}
        >
          <a.icon size={15} />
          {a.label}
        </button>
      ))}
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        aria-label={open ? 'Sluiten' : 'Snelacties'}
        className="flex size-13 items-center justify-center rounded-full shadow-lg transition-transform active:scale-95"
        style={{ width: 52, height: 52, background: 'var(--accent, #38bdf8)', color: '#001018' }}
      >
        {open ? <X size={22} /> : <Plus size={22} />}
      </button>
    </div>
  );
}
