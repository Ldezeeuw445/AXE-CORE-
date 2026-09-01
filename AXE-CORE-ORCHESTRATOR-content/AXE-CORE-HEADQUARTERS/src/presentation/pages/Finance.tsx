/**
 * Finance Hub — income ledger across sources (Prime Opinion, trading, apps, …).
 * Manual log only; AXE can later read this for "what did I earn?" answers.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { WidgetCard } from '@/presentation/components/widgets/WidgetCard';
import { STAT_ROW } from '@/presentation/components/surface/Page';
import {
  DollarSign,
  TrendingUp,
  Plus,
  Trash2,
  ClipboardList,
  RefreshCw,
} from 'lucide-react';
import {
  addIncomeEntry,
  deleteIncomeEntry,
  listIncomeEntries,
  summarizeIncome,
  INCOME_SOURCES,
  type IncomeEntry,
  type IncomeSource,
} from '@/infrastructure/persistence/incomeLedgerService';

function fmt(n: number, currency = 'EUR') {
  try {
    return new Intl.NumberFormat('nl-NL', { style: 'currency', currency }).format(n);
  } catch {
    return `${n.toFixed(2)} ${currency}`;
  }
}

export default function Finance() {
  const [entries, setEntries] = useState<IncomeEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [source, setSource] = useState<IncomeSource>('prime_opinion');
  const [amount, setAmount] = useState('');
  const [units, setUnits] = useState('');
  const [note, setNote] = useState('');
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [currency, setCurrency] = useState('EUR');
  const [saving, setSaving] = useState(false);
  const [filter, setFilter] = useState<IncomeSource | 'all'>('all');

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      setEntries(await listIncomeEntries());
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  const filtered = useMemo(
    () => (filter === 'all' ? entries : entries.filter(e => e.source === filter)),
    [entries, filter],
  );

  const summary = useMemo(() => summarizeIncome(entries, 'EUR'), [entries]);
  const po = summary.bySource.prime_opinion;

  const handleAdd = async () => {
    const amt = parseFloat(amount.replace(',', '.'));
    if (!Number.isFinite(amt) || amt === 0) return;
    setSaving(true);
    try {
      await addIncomeEntry({
        source,
        amount: amt,
        currency,
        date,
        note: note || undefined,
        units: units ? parseInt(units, 10) : undefined,
      });
      setAmount('');
      setUnits('');
      setNote('');
      await reload();
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    await deleteIncomeEntry(id);
    await reload();
  };

  return (
    <motion.div
      className="p-6 h-full overflow-y-auto"
      initial={{ opacity: 0, scale: 0.98 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] as [number, number, number, number] }}
    >
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-page-title font-semibold" style={{ color: 'var(--text-primary)' }}>
            Finance Hub
          </h1>
          <p className="text-xs-custom mt-0.5" style={{ color: 'var(--text-muted)' }}>
            Alle inkomstenbronnen op één plek — jij logt, AXE kan later samenvatten.
          </p>
        </div>
        <button
          onClick={() => void reload()}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs-custom"
          style={{ background: 'var(--bg-active)', border: '1px solid var(--border-active)', color: 'var(--text-secondary)' }}
        >
          <RefreshCw size={12} className={loading ? 'animate-spin' : ''} /> Refresh
        </button>
      </div>

      {/* Metrics */}
      <div className={STAT_ROW}>
        <WidgetCard title="THIS MONTH">
          <div className="flex items-center gap-2">
            <DollarSign size={16} style={{ color: 'var(--success)' }} />
            <span className="text-lg font-semibold" style={{ color: 'var(--text-primary)' }}>
              {fmt(summary.thisMonth)}
            </span>
          </div>
          <p className="text-[10px] mt-1" style={{ color: 'var(--text-muted)' }}>
            {summary.thisMonthUnits > 0 ? `${summary.thisMonthUnits} survey-units gelogd` : 'EUR inkomsten deze maand'}
          </p>
        </WidgetCard>
        <WidgetCard title="ALL TIME (EUR)">
          <div className="flex items-center gap-2">
            <TrendingUp size={16} style={{ color: '#3B82F6' }} />
            <span className="text-lg font-semibold" style={{ color: 'var(--text-primary)' }}>
              {fmt(summary.total)}
            </span>
          </div>
        </WidgetCard>
        <WidgetCard title="PRIME OPINION">
          <div className="flex items-center gap-2">
            <ClipboardList size={16} style={{ color: 'var(--accent-cyan)' }} />
            <span className="text-lg font-semibold" style={{ color: 'var(--text-primary)' }}>
              {fmt(po?.amount ?? 0)}
            </span>
          </div>
          <p className="text-[10px] mt-1" style={{ color: 'var(--text-muted)' }}>
            {po?.units ?? 0} enquêtes · {po?.count ?? 0} logs
          </p>
        </WidgetCard>
        <WidgetCard title="BY SOURCE">
          <div className="space-y-1 max-h-16 overflow-y-auto">
            {INCOME_SOURCES.filter(s => summary.bySource[s.id]?.amount).map(s => (
              <div key={s.id} className="flex justify-between text-[10px]">
                <span style={{ color: s.color }}>{s.label}</span>
                <span style={{ color: 'var(--text-secondary)' }}>{fmt(summary.bySource[s.id].amount)}</span>
              </div>
            ))}
            {!Object.keys(summary.bySource).length && (
              <span className="text-[10px]" style={{ color: 'var(--text-muted)' }}>Nog geen data</span>
            )}
          </div>
        </WidgetCard>
      </div>

      {/* Add entry */}
      <WidgetCard title="LOG INCOME">
        <div className="grid gap-2 [grid-template-columns:repeat(auto-fill,minmax(160px,1fr))] items-end">
          <div>
            <label className="text-[9px] block mb-1" style={{ color: 'var(--text-muted)' }}>Bron</label>
            <select
              value={source}
              onChange={e => setSource(e.target.value as IncomeSource)}
              className="w-full px-2 py-1.5 rounded-lg text-[11px] outline-none"
              style={{ background: 'var(--bg-base)', border: '1px solid var(--border-subtle)', color: 'var(--text-primary)' }}
            >
              {INCOME_SOURCES.map(s => (
                <option key={s.id} value={s.id}>{s.label}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-[9px] block mb-1" style={{ color: 'var(--text-muted)' }}>Bedrag</label>
            <input
              value={amount}
              onChange={e => setAmount(e.target.value)}
              placeholder="12.50"
              className="w-full px-2 py-1.5 rounded-lg text-[11px] font-mono outline-none"
              style={{ background: 'var(--bg-base)', border: '1px solid var(--border-subtle)', color: 'var(--text-primary)' }}
            />
          </div>
          <div>
            <label className="text-[9px] block mb-1" style={{ color: 'var(--text-muted)' }}>Valuta</label>
            <select
              value={currency}
              onChange={e => setCurrency(e.target.value)}
              className="w-full px-2 py-1.5 rounded-lg text-[11px] outline-none"
              style={{ background: 'var(--bg-base)', border: '1px solid var(--border-subtle)', color: 'var(--text-primary)' }}
            >
              <option value="EUR">EUR</option>
              <option value="USD">USD</option>
              <option value="GBP">GBP</option>
            </select>
          </div>
          <div>
            <label className="text-[9px] block mb-1" style={{ color: 'var(--text-muted)' }}>Datum</label>
            <input
              type="date"
              value={date}
              onChange={e => setDate(e.target.value)}
              className="w-full px-2 py-1.5 rounded-lg text-[11px] outline-none"
              style={{ background: 'var(--bg-base)', border: '1px solid var(--border-subtle)', color: 'var(--text-primary)' }}
            />
          </div>
          <div>
            <label className="text-[9px] block mb-1" style={{ color: 'var(--text-muted)' }}>
              # enquêtes (optioneel)
            </label>
            <input
              value={units}
              onChange={e => setUnits(e.target.value)}
              placeholder="3"
              className="w-full px-2 py-1.5 rounded-lg text-[11px] font-mono outline-none"
              style={{ background: 'var(--bg-base)', border: '1px solid var(--border-subtle)', color: 'var(--text-primary)' }}
            />
          </div>
          <button
            onClick={() => void handleAdd()}
            disabled={saving || !amount}
            className="flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-medium"
            style={{ background: 'var(--tint-line)', color: 'var(--accent-cyan)', border: '1px solid var(--tint-line)', opacity: saving || !amount ? 0.5 : 1 }}
          >
            <Plus size={12} /> {saving ? '…' : 'Log'}
          </button>
        </div>
        <input
          value={note}
          onChange={e => setNote(e.target.value)}
          placeholder="Notitie (optioneel) — bijv. cashout of sessie"
          className="w-full mt-2 px-2 py-1.5 rounded-lg text-[11px] outline-none"
          style={{ background: 'var(--bg-base)', border: '1px solid var(--border-subtle)', color: 'var(--text-primary)' }}
        />
        <p className="text-[9px] mt-2" style={{ color: 'var(--text-muted)' }}>
          Tip Prime Opinion: na een sessie of cashout log je bedrag + aantal voltooide enquêtes. Geen automatische koppeling — jij blijft de bron van waarheid.
        </p>
      </WidgetCard>

      {/* Filters + list */}
      <div className="mt-4 flex flex-wrap gap-1.5 mb-3">
        <button
          onClick={() => setFilter('all')}
          className="text-[10px] px-2 py-0.5 rounded font-mono"
          style={{
            background: filter === 'all' ? 'rgba(34,211,238,0.15)' : 'rgba(255,255,255,0.04)',
            color: filter === 'all' ? 'var(--accent-cyan)' : 'var(--text-muted)',
          }}
        >
          all ({entries.length})
        </button>
        {INCOME_SOURCES.map(s => {
          const n = entries.filter(e => e.source === s.id).length;
          if (!n && filter !== s.id) return null;
          return (
            <button
              key={s.id}
              onClick={() => setFilter(s.id)}
              className="text-[10px] px-2 py-0.5 rounded font-mono"
              style={{
                background: filter === s.id ? `${s.color}22` : 'rgba(255,255,255,0.04)',
                color: filter === s.id ? s.color : 'var(--text-muted)',
              }}
            >
              {s.label} ({n})
            </button>
          );
        })}
      </div>

      <WidgetCard title="LEDGER">
        {loading && !entries.length ? (
          <div className="py-8 text-center text-[11px]" style={{ color: 'var(--text-muted)' }}>Laden…</div>
        ) : filtered.length === 0 ? (
          <div className="py-8 text-center text-[11px]" style={{ color: 'var(--text-muted)' }}>
            Nog geen entries. Log je eerste inkomst hierboven.
          </div>
        ) : (
          <div className="space-y-1">
            {filtered.map(e => {
              const meta = INCOME_SOURCES.find(s => s.id === e.source);
              return (
                <div
                  key={e.id}
                  className="flex items-center gap-3 px-2 py-2 rounded-lg"
                  style={{ background: 'var(--bg-base)', border: '1px solid var(--border-subtle)' }}
                >
                  <span className="text-[10px] font-mono w-20 shrink-0" style={{ color: 'var(--text-muted)' }}>
                    {e.date}
                  </span>
                  <span className="text-[10px] font-medium w-28 shrink-0" style={{ color: meta?.color }}>
                    {meta?.label ?? e.source}
                  </span>
                  <span className="text-[12px] font-semibold font-mono" style={{ color: 'var(--text-primary)' }}>
                    {fmt(e.amount, e.currency)}
                  </span>
                  {e.units != null && (
                    <span className="text-[9px]" style={{ color: 'var(--text-muted)' }}>
                      {e.units} enquêtes
                    </span>
                  )}
                  {e.note && (
                    <span className="text-[10px] truncate flex-1" style={{ color: 'var(--text-muted)' }}>
                      {e.note}
                    </span>
                  )}
                  <button
                    onClick={() => void handleDelete(e.id)}
                    className="ml-auto p-1 rounded"
                    style={{ color: 'var(--text-muted)' }}
                    title="Verwijderen"
                  >
                    <Trash2 size={12} />
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </WidgetCard>
    </motion.div>
  );
}
