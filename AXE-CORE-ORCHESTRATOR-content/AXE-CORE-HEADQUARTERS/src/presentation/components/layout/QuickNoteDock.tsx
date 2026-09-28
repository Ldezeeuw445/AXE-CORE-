import { useCallback, useEffect, useRef, useState, type FormEvent, type MouseEvent as ReactMouseEvent } from 'react';
import { Bold, Check, GripHorizontal, Italic, StickyNote, Underline, X } from 'lucide-react';
import { getSupabase } from '@/infrastructure/supabase/supabaseClient';
import { APPS } from '@/domain/apps';

/**
 * Text colours for the note toolbar: the five existing app-identity colours
 * (src/domain/apps.ts, shown nowhere else as "colour swatches" before this)
 * plus one more, "yellow" -- the app's own --warn/--warning token
 * (axe-look.css) rather than an invented hex, since execCommand needs a
 * literal value, not a var() reference.
 */
const NOTE_COLORS: ReadonlyArray<{ naam: string; kleur: string }> = [
  ...APPS.map(a => ({ naam: a.label, kleur: a.kleur })),
  { naam: 'Yellow', kleur: '#FFCC66' },
];

const TOEGESTANE_TAGS = new Set(['B', 'STRONG', 'I', 'EM', 'U', 'SPAN', 'BR', 'DIV']);

/**
 * Strip everything execCommand's output (or a paste from elsewhere) could
 * carry beyond bold/italic/underline/colour -- no scripts, no attributes
 * beyond a colour on SPAN, no links or images. This is a simple note, not a
 * document editor, and this HTML is stored durably in Supabase.
 */
function saneerNotitieHtml(html: string): string {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const opschonen = (el: Element) => {
    for (const kind of [...el.children]) {
      if (!TOEGESTANE_TAGS.has(kind.tagName)) {
        while (kind.firstChild) el.insertBefore(kind.firstChild, kind);
        el.removeChild(kind);
      } else {
        const kleur = kind.tagName === 'SPAN' ? (kind as HTMLElement).style.color : '';
        for (const attr of [...kind.attributes]) kind.removeAttribute(attr.name);
        if (kind.tagName === 'SPAN' && kleur) (kind as HTMLElement).style.color = kleur;
      }
    }
    // Unwrapping a disallowed tag can reveal new disallowed grandchildren as
    // direct children; a plain note nests at most a couple of levels deep, so
    // re-running until nothing changes is simpler and safer than getting the
    // single-pass recursion order exactly right.
    if ([...el.children].some(c => !TOEGESTANE_TAGS.has(c.tagName))) opschonen(el);
    else for (const kind of [...el.children]) opschonen(kind);
  };
  opschonen(doc.body);
  return doc.body.innerHTML;
}

/** Plain preview text, for the "first line becomes the title" logic below --
 *  identical to what the old plain-textarea version did with text.split. */
function platTekst(html: string): string {
  return new DOMParser().parseFromString(html, 'text/html').body.textContent ?? '';
}

function vindDoel(doel: string): DOMRect | null {
  for (const el of document.querySelectorAll<HTMLElement>(`[data-axe-doel="${CSS.escape(doel)}"]`)) {
    const r = el.getBoundingClientRect();
    if (r.width > 0 && r.height > 0) return r;
  }
  return null;
}

interface Positie { top: number; left: number; width: number; height: number }

const MARGE = 10;
const BREEDTE_STANDAARD = 290;
const BREEDTE_MIN = 220;
const HOOGTE_MIN = 160;

/**
 * Where the note opens by default: filling the gap directly left of the
 * composer, spanning exactly from the composer's own top edge down to the
 * bottom nav's bottom edge -- not a CSS calc() approximation of that (the
 * previous version, which is what let it drift onto the bottom nav's own
 * icon row), but the real measured edges of both, the same
 * data-axe-doel/getBoundingClientRect pattern AxePresenceDock.tsx already
 * uses for the same reason.
 *
 * Clamped on the left by the left radial dock's own right edge (radiaal-
 * links), so on a narrow window this shrinks rather than sliding under it.
 */
function standaardPositie(): Positie {
  const composer = vindDoel('axe-composer');
  const bottomNav = vindDoel('axe-bottom-nav');
  const radiaal = vindDoel('radiaal-links');

  const top = composer?.top ?? window.innerHeight - 320;
  const onder = bottomNav ? bottomNav.bottom : window.innerHeight;
  const height = Math.max(HOOGTE_MIN, onder - top);

  const rechterRand = (composer?.left ?? window.innerWidth * 0.7) - MARGE;
  const linkerGrens = (radiaal ? radiaal.right : 0) + MARGE;
  const width = Math.max(Math.min(BREEDTE_MIN, rechterRand - linkerGrens), Math.min(BREEDTE_STANDAARD, rechterRand - linkerGrens));
  const left = Math.max(linkerGrens, rechterRand - width);

  return { top, left, width, height };
}

export function QuickNoteDock() {
  const [open, setOpen] = useState(false);
  const [leeg, setLeeg] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [positie, setPositie] = useState<Positie | null>(null);
  const area = useRef<HTMLDivElement | null>(null);
  const sleep = useRef<{ soort: 'sleep' | 'formaat'; startX: number; startY: number; van: Positie } | null>(null);

  useEffect(() => {
    const toggle = () => setOpen(v => !v);
    window.addEventListener('axe-toggle-quick-note', toggle);
    return () => window.removeEventListener('axe-toggle-quick-note', toggle);
  }, []);

  useEffect(() => {
    if (open) {
      setPositie(standaardPositie());
      requestAnimationFrame(() => area.current?.focus());
    }
  }, [open]);

  useEffect(() => {
    function opBeweging(e: MouseEvent) {
      const bezig = sleep.current;
      if (!bezig) return;
      const dx = e.clientX - bezig.startX;
      const dy = e.clientY - bezig.startY;
      if (bezig.soort === 'sleep') {
        setPositie({
          ...bezig.van,
          left: Math.min(Math.max(0, bezig.van.left + dx), window.innerWidth - 60),
          top: Math.min(Math.max(0, bezig.van.top + dy), window.innerHeight - 40),
        });
      } else {
        setPositie({
          ...bezig.van,
          width: Math.max(BREEDTE_MIN, bezig.van.width + dx),
          height: Math.max(HOOGTE_MIN, bezig.van.height + dy),
        });
      }
    }
    function opLos() { sleep.current = null; }
    window.addEventListener('mousemove', opBeweging);
    window.addEventListener('mouseup', opLos);
    return () => {
      window.removeEventListener('mousemove', opBeweging);
      window.removeEventListener('mouseup', opLos);
    };
  }, []);

  const beginSlepen = useCallback((e: ReactMouseEvent) => {
    if (!positie) return;
    e.preventDefault();
    sleep.current = { soort: 'sleep', startX: e.clientX, startY: e.clientY, van: positie };
  }, [positie]);

  const beginFormaat = useCallback((e: ReactMouseEvent) => {
    if (!positie) return;
    e.preventDefault();
    sleep.current = { soort: 'formaat', startX: e.clientX, startY: e.clientY, van: positie };
  }, [positie]);

  /** Toolbar buttons must not steal focus/selection from the note before
   *  their command runs -- execCommand acts on whatever is currently
   *  selected, so a mousedown that moves focus away breaks "apply to the
   *  selected text" entirely. */
  const behoudSelectie = (e: ReactMouseEvent) => e.preventDefault();

  function zetOpmaak(commando: string, waarde?: string) {
    area.current?.focus();
    document.execCommand(commando, false, waarde);
    setLeeg(!area.current || area.current.textContent?.trim() === '');
  }

  async function save(e?: FormEvent) {
    e?.preventDefault();
    const el = area.current;
    const platteInhoud = el ? platTekst(el.innerHTML).trim() : '';
    if (!platteInhoud || saving || !el) return;
    const sb = getSupabase();
    if (!sb) return;
    setSaving(true);
    const first = platteInhoud.split(/\n/).map(s => s.trim()).find(Boolean) ?? 'Quick note';
    const title = first.length > 56 ? first.slice(0, 53) + '…' : first;
    const { error } = await sb.from('core_kb_documents').insert({
      title,
      content: saneerNotitieHtml(el.innerHTML),
      category: 'Quick Notes',
      ai: 'axe-core',
      source: 'user',
    });
    setSaving(false);
    if (error) return;
    el.innerHTML = '';
    setLeeg(true);
    setSaved(true);
    window.setTimeout(() => setSaved(false), 1400);
  }

  if (!open || !positie) return null;
  return (
    <form
      className="axe-quick-note"
      onSubmit={save}
      data-axe-doel="quick-note"
      style={{ top: positie.top, left: positie.left, width: positie.width, height: positie.height }}
    >
      <div className="axe-quick-note__sleepgreep" onMouseDown={beginSlepen} title="Drag to move">
        <GripHorizontal size={13} />
      </div>

      <div className="axe-quick-note__head">
        <span><StickyNote size={14} /> Quick Note</span>
        <button type="button" onClick={() => setOpen(false)} aria-label="Close note"><X size={14} /></button>
      </div>

      <div className="axe-quick-note__toolbar" onMouseDown={behoudSelectie}>
        <button type="button" title="Bold" aria-label="Bold" onClick={() => zetOpmaak('bold')}><Bold size={13} /></button>
        <button type="button" title="Italic" aria-label="Italic" onClick={() => zetOpmaak('italic')}><Italic size={13} /></button>
        <button type="button" title="Underline" aria-label="Underline" onClick={() => zetOpmaak('underline')}><Underline size={13} /></button>
        <span className="axe-quick-note__kleuren">
          {NOTE_COLORS.map(c => (
            <button key={c.naam} type="button" title={c.naam} aria-label={`Text colour ${c.naam}`}
              className="axe-quick-note__kleur" style={{ background: c.kleur }}
              onClick={() => zetOpmaak('foreColor', c.kleur)} />
          ))}
        </span>
      </div>

      <div
        ref={area}
        className="axe-quick-note__vak"
        contentEditable
        role="textbox"
        aria-multiline="true"
        aria-label="Quick note"
        data-leeg={leeg ? 'ja' : undefined}
        data-placeholder="Type something to remember…"
        onInput={() => setLeeg(area.current?.textContent?.trim() === '')}
      />

      <div className="axe-quick-note__foot">
        <span>{saved ? 'Saved to Knowledge' : 'AXE Core · Knowledge'}</span>
        <button type="submit" disabled={leeg || saving}>
          {saved ? <Check size={13} /> : null}{saving ? 'Saving…' : saved ? 'Saved' : 'Save'}
        </button>
      </div>

      <div className="axe-quick-note__formaatgreep" onMouseDown={beginFormaat} title="Drag to resize" />
    </form>
  );
}
