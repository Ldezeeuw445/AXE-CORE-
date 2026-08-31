import { useEffect, useState } from 'react';
import { Plus, Trash2, Save, Check, Zap } from 'lucide-react';
import { WidgetCard } from '@/presentation/components/widgets/WidgetCard';
import {
  getAxeQuotes,
  setAxeQuotes,
  addAxeQuote,
  removeAxeQuote,
} from '@/domain/catalogs/mindsetLines';
import { loadSetting } from '@/infrastructure/persistence/userSettingsService';

/**
 * Settings → AXE quotes (user-owned).
 * Mindset button uses the built-in 40; AXE button uses this list.
 */
export function MindsetQuotesSection() {
  const [quotes, setQuotes] = useState<string[]>(getAxeQuotes);
  const [draft, setDraft] = useState('');
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    let alive = true;
    void loadSetting<string[]>('axe_mindset_quotes', []).then(remote => {
      if (!alive || !Array.isArray(remote) || remote.length === 0) return;
      const clean = remote.map(String).map(s => s.trim()).filter(Boolean);
      if (clean.length) {
        setAxeQuotes(clean);
        setQuotes(clean);
      }
    });
    return () => { alive = false; };
  }, []);

  const add = () => {
    if (!draft.trim()) return;
    setQuotes(addAxeQuote(draft));
    setDraft('');
  };

  const remove = (i: number) => {
    setQuotes(removeAxeQuote(i));
  };

  const saveAll = () => {
    setAxeQuotes(quotes);
    setSaved(true);
    setTimeout(() => setSaved(false), 1500);
  };

  return (
    <WidgetCard
      title="AXE QUOTES"
      headerAction={<Zap size={14} style={{ color: 'var(--accent-cyan)' }} />}
    >
      <p className="text-xs-custom mb-3" style={{ color: 'var(--text-muted)' }}>
        Jouw eigen lijst voor de cyan <strong style={{ color: 'var(--accent-cyan)' }}>AXE</strong>-knop
        in de rechter drawer. Elke tik roteert en spreekt de volgende regel (actieve TTS).
        De <strong>Mindset</strong>-knop gebruikt de vaste 40 power-lines.
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
          style={{ background: 'var(--tint-line)', border: '1px solid var(--tint-line)', color: 'var(--accent-cyan)' }}
        >
          <Plus size={12} /> Add
        </button>
      </div>

      <div className="space-y-1.5 max-h-64 overflow-y-auto mb-3">
        {quotes.length === 0 ? (
          <p className="text-[11px] py-2" style={{ color: 'var(--text-muted)' }}>
            Nog geen quotes — voeg hierboven toe. AXE-knop doet niets tot er minstens één is.
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
          background: saved ? 'rgba(16,185,129,0.15)' : 'var(--tint)',
          border: `1px solid ${saved ? 'rgba(16,185,129,0.4)' : 'var(--tint-line)'}`,
          color: saved ? 'var(--success)' : 'var(--accent-cyan)',
        }}
      >
        {saved ? <><Check size={12} /> Opgeslagen</> : <><Save size={12} /> Opslaan</>}
      </button>
    </WidgetCard>
  );
}
