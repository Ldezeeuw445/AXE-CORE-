import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Check, StickyNote, X } from 'lucide-react';
import { getSupabase } from '@/infrastructure/supabase/supabaseClient';

export function QuickNoteDock() {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState('');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const area = useRef<HTMLTextAreaElement | null>(null);

  useEffect(() => {
    const toggle = () => setOpen(v => !v);
    window.addEventListener('axe-toggle-quick-note', toggle);
    return () => window.removeEventListener('axe-toggle-quick-note', toggle);
  }, []);

  useEffect(() => {
    if (open) requestAnimationFrame(() => area.current?.focus());
  }, [open]);

  async function save(e?: FormEvent) {
    e?.preventDefault();
    const content = text.trim();
    if (!content || saving) return;
    const sb = getSupabase();
    if (!sb) return;
    setSaving(true);
    const first = content.split(/\n/).map(s => s.trim()).find(Boolean) ?? 'Quick note';
    const title = first.length > 56 ? first.slice(0, 53) + '…' : first;
    const { error } = await sb.from('core_kb_documents').insert({
      title,
      content,
      category: 'Quick Notes',
      ai: 'axe-core',
      source: 'user',
    });
    setSaving(false);
    if (error) return;
    setText('');
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
      <textarea
        ref={area}
        value={text}
        onChange={e => setText(e.target.value)}
        placeholder="Type something to remember…"
        aria-label="Quick note"
      />
      <div className="axe-quick-note__foot">
        <span>{saved ? 'Saved to Knowledge' : 'AXE Core · Knowledge'}</span>
        <button type="submit" disabled={!text.trim() || saving}>
          {saved ? <Check size={13} /> : null}{saving ? 'Saving…' : saved ? 'Saved' : 'Save'}
        </button>
      </div>
    </form>
  );
}
