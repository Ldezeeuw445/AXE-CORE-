import { useEffect, useRef, useState, type FormEvent, type MouseEvent as ReactMouseEvent } from 'react';
import { Bold, Check, Italic, StickyNote, Underline, X } from 'lucide-react';
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

export function QuickNoteDock() {
  const [open, setOpen] = useState(false);
  const [leeg, setLeeg] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const area = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const toggle = () => setOpen(v => !v);
    window.addEventListener('axe-toggle-quick-note', toggle);
    return () => window.removeEventListener('axe-toggle-quick-note', toggle);
  }, []);

  useEffect(() => {
    if (open) requestAnimationFrame(() => area.current?.focus());
  }, [open]);

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

  if (!open) return null;
  return (
    <form className="axe-quick-note" onSubmit={save} data-axe-doel="quick-note">
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
    </form>
  );
}
