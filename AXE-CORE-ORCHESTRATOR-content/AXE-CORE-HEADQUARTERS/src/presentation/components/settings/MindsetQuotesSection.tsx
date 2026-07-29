import { useEffect, useState } from 'react';
import { Plus, Trash2, Save, Check, Flame } from 'lucide-react';
import { WidgetCard } from '@/presentation/components/widgets/WidgetCard';
import {
  getMindsetQuotes,
  setMindsetQuotes,
  addMindsetQuote,
  removeMindsetQuote,
} from '@/domain/catalogs/mindsetLines';
import { loadSetting } from '@/infrastructure/persistence/userSettingsService';

/**
 * Settings → Mindset Quotes
 * Luka owns every line. The right-panel Mindset button rotates + speaks these.
 */
export function MindsetQuotesSection() {
  const [quotes, setQuotes] = useState<string[]>(getMindsetQuotes);
  const [draft, setDraft] = useState('');
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    let alive = true;
    void loadSetting<string[]>('axe_mindset_quotes', []).then(remote => {
      if (!alive || !Array.isArray(remote) || remote.length === 0) return;
      const clean = remote.map(String).map(s => s.trim()).filter(Boolean);
      if (clean.length) {
        setMindsetQuotes(clean);
        setQuotes(clean);
      }
    });
    return () => { alive = false; };
  }, []);

  const add = () => {
    if (!draft.trim()) return;
    const next = addMindsetQuote(draft);
    setQuotes(next);
    setDraft('');
  };

  const remove = (i: number) => {
    setQuotes(removeMindsetQuote(i));
  };

  const saveAll = () => {
    setMindsetQuotes(quotes);
    setSaved(true);
    setTimeout(() => setSaved(false), 1500);
  };

  return (
    <WidgetCard
      title="MINDSET QUOTES"
      headerAction={<Flame size={14} style={{ color: 'var(--accent-cyan)' }} />}
    >
      <p className="text-xs-custom mb-3" style={{ color: 'var(--text-muted)' }}>
        Jouw lijst. De cyan <strong style={{ color: 'var(--accent-cyan)' }}>Mindset</strong>-knop
        in de rechter drawer roteert en spreekt deze regels hardop (actieve TTS-stem).
        Lege lijst = knop doet niets tot je iets toevoegt.
      </p>

      <div className="flex gap-1.5 mb-3">
        <input
          value={draft}
          onChange={e => setDraft(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') add(); }}
          placeholder="Plak of typ een quote…"
          className="flex-1 text-small px-3 py-2 rounded-lg outline-none"
          style={{ background: 'var(--bg-base)', border: '1px solid var(--border-active)', color: 'var(--text-primary)' }}
        />
        <button
          onClick={add}
          className="flex items-center gap-1 px-3 py-2 rounded-lg text-xs-custom font-medium"
          style={{ background: 'rgba(34,211,238,0.12)', border: '1px solid rgba(34,211,238,0.35)', color: 'var(--accent-cyan)' }}
        >
          <Plus size={12} /> Add
        </button>
      </div>

      <div className="space-y-1.5 max-h-64 overflow-y-auto mb-3">
        {quotes.length === 0 ? (
          <p className="text-[11px] py-2" style={{ color: 'var(--text-muted)' }}>
            Nog geen quotes — voeg hierboven toe.
          </p>
        ) : quotes.map((q, i) => (
          <div
            key={`${i}-${q.slice(0, 12)}`}
            className="flex items-start gap-2 p-2 rounded-lg"
            style={{ background: 'var(--bg-base)', border: '1px solid var(--border-subtle)' }}
          >
            <span className="text-[10px] font-mono mt-0.5" style={{ color: 'var(--text-muted)' }}>{i + 1}.</span>
            <p className="flex-1 text-[12px] leading-snug" style={{ color: 'var(--text-primary)' }}>{q}</p>
            <button onClick={() => remove(i)} className="p-1 shrink-0" title="Verwijder" style={{ color: 'var(--text-muted)' }}>
              <Trash2 size={12} />
            </button>
          </div>
        ))}
      </div>

      <button
        onClick={saveAll}
        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs-custom font-medium"
        style={{
          background: saved ? 'rgba(16,185,129,0.15)' : 'rgba(34,211,238,0.1)',
          border: `1px solid ${saved ? 'rgba(16,185,129,0.4)' : 'rgba(34,211,238,0.3)'}`,
          color: saved ? 'var(--success)' : 'var(--accent-cyan)',
        }}
      >
        {saved ? <><Check size={12} /> Opgeslagen</> : <><Save size={12} /> Opslaan</>}
      </button>
    </WidgetCard>
  );
}
