import { useEffect, useState, useCallback } from 'react';
import { motion } from 'framer-motion';
import { Database, RefreshCw, Search, Edit2, Trash2, Plus, ChevronRight, AlertCircle } from 'lucide-react';
import { sbListTables, sbGetRows, sbUpdateRow, sbDeleteRow, isAxeApiConfigured, type TableRow } from '@/services/integrations/axeCoreApiService';
import { Sheet, SheetContent, SheetTrigger } from '@/components/ui/sheet';
import { useIsMobile } from '@/hooks/use-mobile';

// Table prefix → project color
const PREFIX_COLORS: Record<string, string> = {
  core_:       '#22d3ee',  // cyan
  intel_:      '#60a5fa',  // blue
  assistant_:  '#c084fc',  // purple
  axe_:        '#c084fc',  // purple (companion)
  adaptive_:   '#c084fc',
  conversations: '#c084fc',
  messages:    '#c084fc',
  mt5_:        '#fbbf24',  // yellow
  broker_:     '#fbbf24',
  execution_:  '#fbbf24',
  trade_:      '#fbbf24',
  positions:   '#fbbf24',
  watchlists:  '#fbbf24',
  user_:       '#fbbf24',
  profiles:    '#6b7280',
  accounts:    '#6b7280',
};

const PROJECT_LABELS: [string, string][] = [
  ['core_',       'AXE CORE'],
  ['intel_',      'AXE Intel'],
  ['assistant_',  'AXE Companion'],
  ['axe_',        'AXE Companion'],
  ['adaptive_',   'AXE Companion'],
  ['conversations', 'AXE Companion'],
  ['messages',    'AXE Companion'],
  ['mt5_',        'Trading OS'],
  ['broker_',     'Trading OS'],
  ['execution_',  'Trading OS'],
  ['trade_',      'Trading OS'],
  ['positions',   'Trading OS'],
  ['watchlists',  'Trading OS'],
  ['user_',       'Trading OS'],
  ['profiles',    'Shared'],
  ['accounts',    'Shared'],
];

function getColor(name: string): string {
  for (const [prefix, color] of Object.entries(PREFIX_COLORS)) {
    if (name.startsWith(prefix) || name === prefix.replace('_', '')) return color;
  }
  return '#6b7280';
}

function getProject(name: string): string {
  for (const [prefix, project] of PROJECT_LABELS) {
    if (name.startsWith(prefix) || name === prefix.replace('_', '')) return project;
  }
  return 'Other';
}

type TableInfo = { table_name: string; row_count: number };

export default function TableEditor() {
  const [tables, setTables] = useState<TableInfo[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [rows, setRows] = useState<TableRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [tableLoading, setTableLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [rowSearch, setRowSearch] = useState('');
  const [editRow, setEditRow] = useState<TableRow | null>(null);
  const [editData, setEditData] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [mobileTablesOpen, setMobileTablesOpen] = useState(false);
  const isMobile = useIsMobile();

  useEffect(() => {
    if (!isAxeApiConfigured) { setTableLoading(false); return; }
    sbListTables()
      .then(data => setTables(data.sort((a, b) => a.table_name.localeCompare(b.table_name))))
      .catch(e => setError(e.message))
      .finally(() => setTableLoading(false));
  }, []);

  const loadRows = useCallback(async (tableName: string) => {
    setLoading(true);
    setRows([]);
    setRowSearch('');
    try {
      const data = await sbGetRows(tableName, { limit: 100, orderBy: 'created_at', orderDir: 'desc' });
      setRows(data);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to load rows');
    } finally {
      setLoading(false);
    }
  }, []);

  const selectTable = (name: string) => {
    setSelected(name);
    loadRows(name);
    setError(null);
  };

  const handleSave = async () => {
    if (!editRow?.id || !selected) return;
    setSaving(true);
    try {
      const parsed = JSON.parse(editData);
      await sbUpdateRow(selected, String(editRow.id), parsed);
      await loadRows(selected);
      setEditRow(null);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (row: TableRow) => {
    if (!row.id || !selected) return;
    if (!confirm(`Delete row ${row.id}?`)) return;
    try {
      await sbDeleteRow(selected, String(row.id));
      setRows(r => r.filter(x => x.id !== row.id));
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Delete failed');
    }
  };

  // Group tables by project
  const grouped = tables.reduce<Record<string, TableInfo[]>>((acc, t) => {
    const proj = getProject(t.table_name);
    if (!acc[proj]) acc[proj] = [];
    acc[proj].push(t);
    return acc;
  }, {});

  const filteredTables = search
    ? tables.filter(t => t.table_name.includes(search.toLowerCase()))
    : null;

  const columns = rows.length > 0 ? Object.keys(rows[0]) : [];
  const filteredRows = rowSearch
    ? rows.filter(r => JSON.stringify(r).toLowerCase().includes(rowSearch.toLowerCase()))
    : rows;

  if (!isAxeApiConfigured) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-4 p-8" style={{ color: 'var(--text-secondary)' }}>
        <AlertCircle size={32} style={{ color: 'var(--warning)' }} />
        <p className="font-semibold" style={{ color: 'var(--text-primary)' }}>AXE Core API not configured</p>
        <p className="text-sm text-center max-w-md">
          Deploy the VPS service and add <code className="px-1 rounded" style={{ background: '#1a1a1a' }}>VITE_AXE_CORE_API_URL</code> and <code className="px-1 rounded" style={{ background: '#1a1a1a' }}>VITE_AXE_CORE_API_KEY</code> to Vercel.
        </p>
        <p className="text-xs" style={{ color: 'var(--text-muted)' }}>See: backend/axe_api/deploy.sh</p>
      </div>
    );
  }

  return (
    <motion.div
      className="flex h-full overflow-hidden"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.25 }}
    >
      {/* Left: Table list */}
      <div
        className="hidden md:flex flex-shrink-0 flex flex-col overflow-hidden"
        style={{
          width: '240px',
          borderRight: '1px solid rgba(255,255,255,0.06)',
          backgroundColor: '#060608',
        }}
      >
        <div className="p-3 border-b" style={{ borderColor: 'rgba(255,255,255,0.06)' }}>
          <div
            className="flex items-center gap-2 rounded-lg px-2 py-1.5"
            style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.06)' }}
          >
            <Search size={12} style={{ color: 'var(--text-muted)' }} />
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Filter tables..."
              className="flex-1 bg-transparent text-xs outline-none"
              style={{ color: 'var(--text-primary)' }}
            />
          </div>
        </div>
        <div className="overflow-y-auto flex-1">
          {tableLoading ? (
            <div className="p-4 text-xs" style={{ color: 'var(--text-muted)' }}>Loading tables…</div>
          ) : filteredTables ? (
            filteredTables.map(t => (
              <TableListItem key={t.table_name} t={t} selected={selected} onSelect={selectTable} />
            ))
          ) : (
            Object.entries(grouped).sort().map(([project, items]) => (
              <div key={project}>
                <div className="px-3 pt-3 pb-1">
                  <span className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--text-muted)', letterSpacing: '0.08em' }}>
                    {project}
                  </span>
                </div>
                {items.map(t => (
                  <TableListItem key={t.table_name} t={t} selected={selected} onSelect={selectTable} />
                ))}
              </div>
            ))
          )}
        </div>
      </div>

      {/* Right: Table data */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {!selected ? (
          <div className="flex flex-col items-center justify-center h-full gap-3" style={{ color: 'var(--text-muted)' }}>
            <Database size={28} />
            <span className="text-sm">Select a table to view data</span>
          </div>
        ) : (
          <>
            {/* Toolbar */}
            <div
              className="flex items-center gap-3 px-4 py-2.5 flex-shrink-0"
              style={{ borderBottom: '1px solid rgba(255,255,255,0.06)', backgroundColor: '#080810' }}
            >
              <Database size={14} style={{ color: getColor(selected) }} />
              <span className="font-mono text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>{selected}</span>
              <span className="text-xs" style={{ color: 'var(--text-muted)' }}>{rows.length} rows</span>
              <div className="flex-1" />
              {isMobile && (
                <Sheet open={mobileTablesOpen} onOpenChange={setMobileTablesOpen}>
                  <SheetTrigger asChild>
                    <button className="flex items-center gap-1 px-2 py-1 rounded text-[10px] mr-2" style={{ background: 'rgba(34,211,238,0.1)', color: '#22D3EE', border: '1px solid rgba(34,211,238,0.2)' }}>
                      Tables
                    </button>
                  </SheetTrigger>
                  <SheetContent side="left" className="w-[260px] p-0 overflow-hidden" style={{ background: '#060608', borderRight: '1px solid rgba(255,255,255,0.06)' }}>
                    <div className="p-3 border-b" style={{ borderColor: 'rgba(255,255,255,0.06)' }}>
                      <div className="flex items-center gap-2 rounded-lg px-2 py-1.5" style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.06)' }}>
                        <Search size={12} style={{ color: 'var(--text-muted)' }} />
                        <input
                          value={search}
                          onChange={e => setSearch(e.target.value)}
                          placeholder="Filter tables..."
                          className="flex-1 bg-transparent text-xs outline-none"
                          style={{ color: 'var(--text-primary)' }}
                        />
                      </div>
                    </div>
                    <div className="overflow-y-auto flex-1 p-2">
                      {tableLoading ? (
                        <div className="p-4 text-xs" style={{ color: 'var(--text-muted)' }}>Loading tables…</div>
                      ) : filteredTables ? (
                        filteredTables.map(t => (
                          <button key={t.table_name} onClick={() => { selectTable(t.table_name); setMobileTablesOpen(false); }}
                            className="w-full flex items-center gap-2 px-3 py-1.5 text-left transition-colors"
                            style={{ background: selected === t.table_name ? `${getColor(t.table_name)}15` : 'transparent', borderLeft: selected === t.table_name ? `2px solid ${getColor(t.table_name)}` : '2px solid transparent' }}>
                            <span className="flex-1 font-mono truncate text-xs" style={{ color: selected === t.table_name ? getColor(t.table_name) : 'var(--text-secondary)' }}>{t.table_name}</span>
                            <span className="text-xs flex-shrink-0" style={{ color: 'var(--text-muted)' }}>{t.row_count}</span>
                          </button>
                        ))
                      ) : (
                        Object.entries(grouped).sort().map(([project, items]) => (
                          <div key={project}>
                            <div className="px-3 pt-3 pb-1">
                              <span className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--text-muted)', letterSpacing: '0.08em' }}>{project}</span>
                            </div>
                            {items.map(t => (
                              <button key={t.table_name} onClick={() => { selectTable(t.table_name); setMobileTablesOpen(false); }}
                                className="w-full flex items-center gap-2 px-3 py-1.5 text-left transition-colors"
                                style={{ background: selected === t.table_name ? `${getColor(t.table_name)}15` : 'transparent', borderLeft: selected === t.table_name ? `2px solid ${getColor(t.table_name)}` : '2px solid transparent' }}>
                                <span className="flex-1 font-mono truncate text-xs" style={{ color: selected === t.table_name ? getColor(t.table_name) : 'var(--text-secondary)' }}>{t.table_name}</span>
                                <span className="text-xs flex-shrink-0" style={{ color: 'var(--text-muted)' }}>{t.row_count}</span>
                              </button>
                            ))}
                          </div>
                        ))
                      )}
                    </div>
                  </SheetContent>
                </Sheet>
              )}
              {/* Row search */}
              <div
                className="flex items-center gap-1.5 rounded px-2 py-1"
                style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.06)' }}
              >
                <Search size={11} style={{ color: 'var(--text-muted)' }} />
                <input
                  value={rowSearch}
                  onChange={e => setRowSearch(e.target.value)}
                  placeholder="Search rows..."
                  className="bg-transparent text-xs outline-none w-32"
                  style={{ color: 'var(--text-primary)' }}
                />
              </div>
              <button
                onClick={() => loadRows(selected)}
                className="p-1.5 rounded transition-colors hover:bg-white/5"
                title="Refresh"
              >
                <RefreshCw size={13} style={{ color: 'var(--text-muted)' }} />
              </button>
            </div>

            {error && (
              <div className="px-4 py-2 text-xs" style={{ background: 'rgba(239,68,68,0.1)', color: '#ef4444' }}>
                {error}
              </div>
            )}

            {/* Data table */}
            {loading ? (
              <div className="flex items-center justify-center flex-1" style={{ color: 'var(--text-muted)' }}>
                <RefreshCw size={16} className="animate-spin mr-2" /> Loading…
              </div>
            ) : (
              <div className="flex-1 overflow-auto">
                <table className="w-full text-xs border-collapse">
                  <thead>
                    <tr style={{ backgroundColor: '#0A0A12', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                      {columns.map(col => (
                        <th
                          key={col}
                          className="text-left px-3 py-2 font-semibold whitespace-nowrap sticky top-0"
                          style={{
                            color: 'var(--text-muted)',
                            backgroundColor: '#0A0A12',
                            borderRight: '1px solid rgba(255,255,255,0.04)',
                            letterSpacing: '0.06em',
                            textTransform: 'uppercase',
                            fontSize: '10px',
                          }}
                        >
                          {col}
                        </th>
                      ))}
                      <th
                        className="sticky top-0 px-2 py-2"
                        style={{ backgroundColor: '#0A0A12', width: '60px', minWidth: '60px' }}
                      />
                    </tr>
                  </thead>
                  <tbody>
                    {filteredRows.map((row, i) => (
                      <tr
                        key={String(row.id ?? i)}
                        style={{
                          borderBottom: '1px solid rgba(255,255,255,0.03)',
                          backgroundColor: i % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.01)',
                        }}
                        onMouseEnter={e => { (e.currentTarget as HTMLElement).style.backgroundColor = 'rgba(34,211,238,0.04)'; }}
                        onMouseLeave={e => { (e.currentTarget as HTMLElement).style.backgroundColor = i % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.01)'; }}
                      >
                        {columns.map(col => (
                          <td
                            key={col}
                            className="px-3 py-1.5 font-mono"
                            style={{
                              color: 'var(--text-secondary)',
                              borderRight: '1px solid rgba(255,255,255,0.03)',
                              maxWidth: '200px',
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                              whiteSpace: 'nowrap',
                            }}
                            title={String(row[col] ?? '')}
                          >
                            {formatCell(row[col])}
                          </td>
                        ))}
                        <td className="px-2 py-1 text-right">
                          <div className="flex gap-1 justify-end opacity-0 group-hover:opacity-100 transition-opacity">
                            <button
                              onClick={() => { setEditRow(row); setEditData(JSON.stringify(row, null, 2)); }}
                              className="p-1 rounded hover:bg-white/10 transition-colors"
                            >
                              <Edit2 size={11} style={{ color: 'var(--accent-cyan)' }} />
                            </button>
                            <button
                              onClick={() => handleDelete(row)}
                              className="p-1 rounded hover:bg-white/10 transition-colors"
                            >
                              <Trash2 size={11} style={{ color: '#ef4444' }} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {filteredRows.length === 0 && !loading && (
                  <div className="flex items-center justify-center py-12 text-sm" style={{ color: 'var(--text-muted)' }}>
                    No rows found
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </div>

      {/* Edit Modal */}
      {editRow && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center"
          style={{ background: 'rgba(0,0,0,0.7)' }}
          onClick={() => setEditRow(null)}
        >
          <div
            className="rounded-xl p-5 w-[600px] max-h-[80vh] flex flex-col gap-4"
            style={{ background: '#0E0E18', border: '1px solid rgba(255,255,255,0.1)' }}
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <span className="font-semibold text-sm" style={{ color: 'var(--text-primary)' }}>
                Edit row — {selected}
              </span>
              <span className="font-mono text-xs" style={{ color: 'var(--text-muted)' }}>{String(editRow.id ?? '')}</span>
            </div>
            <textarea
              value={editData}
              onChange={e => setEditData(e.target.value)}
              className="flex-1 font-mono text-xs rounded-lg p-3 outline-none resize-none"
              style={{
                background: '#060608',
                border: '1px solid rgba(255,255,255,0.08)',
                color: 'var(--text-primary)',
                minHeight: '300px',
              }}
            />
            {error && <p className="text-xs" style={{ color: '#ef4444' }}>{error}</p>}
            <div className="flex gap-2 justify-end">
              <button
                onClick={() => setEditRow(null)}
                className="px-3 py-1.5 rounded-lg text-sm"
                style={{ background: 'rgba(255,255,255,0.06)', color: 'var(--text-secondary)' }}
              >
                Cancel
              </button>
              <button
                onClick={handleSave}
                disabled={saving}
                className="px-3 py-1.5 rounded-lg text-sm font-semibold"
                style={{ background: 'var(--accent-cyan)', color: '#000' }}
              >
                {saving ? 'Saving…' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      )}
    </motion.div>
  );
}

function TableListItem({ t, selected, onSelect }: { t: TableInfo; selected: string | null; onSelect: (n: string) => void }) {
  const isActive = t.table_name === selected;
  const color = getColor(t.table_name);
  return (
    <button
      onClick={() => onSelect(t.table_name)}
      className="w-full flex items-center gap-2 px-3 py-1.5 text-left transition-colors"
      style={{
        backgroundColor: isActive ? `${color}15` : 'transparent',
        borderLeft: isActive ? `2px solid ${color}` : '2px solid transparent',
      }}
    >
      <span className="flex-1 font-mono truncate text-xs" style={{ color: isActive ? color : 'var(--text-secondary)' }}>
        {t.table_name}
      </span>
      <span className="text-xs flex-shrink-0" style={{ color: 'var(--text-muted)' }}>
        {t.row_count}
      </span>
      {isActive && <ChevronRight size={10} style={{ color, flexShrink: 0 }} />}
    </button>
  );
}

function formatCell(val: unknown): string {
  if (val === null || val === undefined) return '—';
  if (typeof val === 'object') return JSON.stringify(val).slice(0, 60);
  const s = String(val);
  return s.length > 80 ? s.slice(0, 80) + '…' : s;
}
