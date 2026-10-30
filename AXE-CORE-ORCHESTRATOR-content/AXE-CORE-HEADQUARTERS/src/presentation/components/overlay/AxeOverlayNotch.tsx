/**
 * Always-on AXE floating notch — louis_rlee visual language.
 * Collapsed: starry dark pill + white blob + home/chat/+/settings/volume.
 * Expanded: same chrome → attachment chip, thinking dots, Continue… input.
 * Lives in a dedicated Tauri WebviewWindow (zwevendeVensters type `axe`) or
 * the standalone apps/axe-overlay binary.
 */
import { useState } from 'react';
import { Home, MessageSquare, Plus, Settings, Volume2 } from 'lucide-react';
import './AxeOverlayNotch.css';

export function AxeOverlayNotch({
  onHome,
  onSend,
  onOpenChange,
}: {
  onHome?: () => void;
  onSend?: (text: string) => void;
  onOpenChange?: (open: boolean) => void;
}) {
  const [open, setOpen] = useState(false);
  const set = (v: boolean | ((prev: boolean) => boolean)) => {
    setOpen((prev) => {
      const next = typeof v === 'function' ? v(prev) : v;
      onOpenChange?.(next);
      return next;
    });
  };
  const [tekst, setTekst] = useState('Continue…');

  const icons = (
    <>
      <button type="button" className="axe-ov__ico" aria-label="Home" onClick={() => { set(false); onHome?.(); }}>
        <Home size={15} strokeWidth={1.7} />
      </button>
      <button type="button" className="axe-ov__ico" aria-label="Chat" aria-pressed={open} onClick={() => set(true)}>
        <MessageSquare size={15} strokeWidth={1.7} />
      </button>
      <button type="button" className="axe-ov__ico" aria-label="New">
        <Plus size={15} strokeWidth={1.7} />
      </button>
    </>
  );
  const iconsRight = (
    <>
      <button type="button" className="axe-ov__ico" aria-label="Settings">
        <Settings size={15} strokeWidth={1.7} />
      </button>
      <button type="button" className="axe-ov__ico" aria-label="Volume">
        <Volume2 size={15} strokeWidth={1.7} />
      </button>
    </>
  );

  return (
    <div className={`axe-ov ${open ? 'axe-ov--open' : 'axe-ov--notch'}`} data-axe-overlay>
      <div className="axe-ov__stars" aria-hidden="true" />
      <div className="axe-ov__top" data-tauri-drag-region>
        <div className="axe-ov__icons">{icons}</div>
        <button
          type="button"
          className="axe-ov__blob"
          aria-label={open ? 'Collapse AXE' : 'Expand AXE chat'}
          onClick={() => set((v) => !v)}
          title="AXE"
        />
        <div className="axe-ov__icons">{iconsRight}</div>
      </div>
      {open && (
        <div className="axe-ov__body">
          <div className="axe-ov__attach">
            <span className="axe-ov__pdf">PDF</span>
            <span>quote.pdf</span>
          </div>
          <div className="axe-ov__dots" aria-hidden="true">
            <span /><span /><span />
          </div>
          <form
            className="axe-ov__input"
            onSubmit={(e) => {
              e.preventDefault();
              const t = tekst.trim();
              if (!t) return;
              onSend?.(t);
            }}
          >
            <span className="axe-ov__blob axe-ov__blob--sm" aria-hidden="true" />
            <input
              value={tekst}
              onChange={(e) => setTekst(e.target.value)}
              aria-label="Message AXE"
            />
            <button type="submit" className="axe-ov__send" aria-label="Send">↑</button>
          </form>
        </div>
      )}
    </div>
  );
}
