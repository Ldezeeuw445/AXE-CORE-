/**
 * MobileComposer — de composer-pil voor de telefoon.
 *
 * Dezelfde `axe-composer`/`axe-gemini`-schil als de app, zodat het materiaal
 * klopt. Wat je typt gaat via de voice-store de chat in (net als de onderbalk
 * op de desktop), en daarna spring je naar Home waar het antwoord verschijnt.
 * Los onderdeel zodat de mobiele home én het lock screen dezelfde composer
 * delen — één plek, geen twee versies die uit elkaar lopen.
 */
import { useCallback, useState } from 'react';
import { useNavigate } from 'react-router';
import { Send } from 'lucide-react';
import { useVoiceStore } from '@/presentation/store/voiceStore';

export function MobileComposer() {
  const navigate = useNavigate();
  const sendMessage = useVoiceStore((s) => s.sendMessage);
  const [draft, setDraft] = useState('');

  const send = useCallback(() => {
    const text = draft.trim();
    if (!text) return;
    void sendMessage(text).catch(() => {});
    setDraft('');
    navigate('/'); // naar de chatplaat, waar het antwoord verschijnt
  }, [draft, sendMessage, navigate]);

  return (
    <div className="axe-composer flex-shrink-0 px-2.5 py-2.5">
      <div className="axe-gemini-shell">
        <div className="axe-gemini-inner flex items-center gap-1.5">
          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') send(); }}
            placeholder="Vraag AXE iets…"
            className="min-w-0 flex-1 bg-transparent px-2 py-1.5 text-sm outline-none"
            style={{ color: 'var(--text-primary)' }}
          />
          <button
            type="button"
            onClick={send}
            disabled={!draft.trim()}
            aria-label="Verstuur"
            className="flex size-8 flex-none items-center justify-center rounded-full disabled:opacity-40"
            style={{ background: 'var(--accent, #38bdf8)', color: '#001018' }}
          >
            <Send size={15} />
          </button>
        </div>
      </div>
    </div>
  );
}
