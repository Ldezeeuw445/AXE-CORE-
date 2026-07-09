import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { requireSupabase } from '@/lib/supabaseClient';
import { getSystemState, checkAllServices, type ServiceState } from '@/services/systemService';
import { SystemRegistryPanel } from '@/components/shared/SystemRegistryPanel';

/* ─── Project definitions ──────────────────────────────────────────── */
const PROJECTS = [
  {
    id: 'axe-core', name: 'AXE CORE', color: '#22D3EE', emoji: '◈',
    description: 'AI Operating System — Headquarters',
    url: 'axe-core-rust.vercel.app',
    tablePrefixes: ['core_'],
    stack: [
      { name: 'Vercel',      color: '#FFFFFF', note: 'axe-core-rust.vercel.app' },
      { name: 'Supabase',    color: '#3ECF8E', note: 'pqnngpcgbdwxavbatbia' },
      { name: 'GitHub',      color: '#E5E7EB', note: 'Ldezeeuw445/AXE-CORE-' },
      { name: 'LiveKit',     color: '#A855F7', note: 'axe-core-yma6pgy1.livekit.cloud' },
      { name: 'n8n',         color: '#FF6D5A', note: 'n8n.axecompanion.com' },
      { name: 'LangGraph',   color: '#22D3EE', note: 'orchestrator / health + dispatch' },
      { name: 'Terminal',    color: '#38BDF8', note: 'wss://api.axecompanion.com/terminal' },
      { name: 'Hetzner VPS', color: '#D63B2F', note: '89.167.78.6 (Ollama)' },
      { name: 'Cloudflare',  color: '#F48120', note: 'DNS + proxy' },
      { name: 'Google Maps', color: '#10B981', note: 'free view / map preview integration' },
      { name: 'SmartThings', color: '#3B82F6', note: 'device control integration' },
    ],
  },
  {
    id: 'axe-companion', name: 'AXE Companion', color: '#10B981', emoji: '◉',
    description: 'AI Personal Assistant — Live & Production',
    url: 'axecompanion.com',
    tablePrefixes: ['assistant_', 'adaptive_ui_', 'axe_', 'automation_', 'trigger_', 'push_', 'vault_', 'user_workspace_'],
    exactTables: ['conversations', 'messages', 'notes', 'attachments', 'landing_feedback_public', 'landing_feedback_submissions'],
    stack: [
      { name: 'Vercel',     color: '#FFFFFF', note: 'axecompanion.com' },
      { name: 'Supabase',   color: '#3ECF8E', note: 'shared project (auth + DB)' },
      { name: 'Cloudflare', color: '#F48120', note: 'DNS + tunnels' },
      { name: 'MetaAPI',    color: '#0066CC', note: 'metaapi.cloud (broker bridge)' },
      { name: 'Ollama',     color: '#F59E0B', note: 'ollama.axecompanion.com' },
      { name: 'Railway',    color: '#8B5CF6', note: 'background workers' },
    ],
  },
  {
    id: 'trading-os', name: 'Trading OS', color: '#F59E0B', emoji: '◆',
    description: 'Trading & Portfolio Management',
    url: 'tradingos.app',
    tablePrefixes: ['mt5_', 'broker_', 'execution_', 'trade_journal_', 'user_broker_', 'user_crypto_', 'user_journal_', 'user_trading_'],
    exactTables: ['positions', 'watchlists', 'watch_requests', 'chart_live_snapshots', 'setup_reviews', 'alerts', 'user_alerts'],
    stack: [
      { name: 'Vercel',       color: '#FFFFFF', note: 'tradingos.app' },
      { name: 'Supabase',     color: '#3ECF8E', note: 'shared project' },
      { name: 'Cloudflare',   color: '#F48120', note: 'DNS' },
      { name: 'MetaTrader 5', color: '#0066CC', note: 'MT5 broker API' },
    ],
  },
  {
    id: 'axe-intel', name: 'AXE Intel', color: '#3B82F6', emoji: '◇',
    description: 'Market Intelligence & Signal Engine',
    url: 'AXE Intel backend',
    tablePrefixes: ['intel_'],
    stack: [
      { name: 'Hetzner VPS', color: '#D63B2F', note: 'Python scrapers (89.167.78.6)' },
      { name: 'Supabase',    color: '#3ECF8E', note: 'shared project' },
      { name: 'Cloudflare',  color: '#F48120', note: 'DNS' },
    ],
  },
  {
    id: 'shared', name: 'Shared', color: '#6B7280', emoji: '○',
    description: 'Auth, profiles & cross-app tables',
    url: '',
    tablePrefixes: ['profiles', 'accounts', 'user_settings', 'audit_', 'engine_proxy_'],
    exactTables: ['profiles', 'accounts', 'user_settings', 'audit_trail', 'engine_proxy_bundle_parts', 'engine_proxy_index_parts'],
    stack: [
      { name: 'Supabase Auth', color: '#3ECF8E', note: 'Shared auth across all apps' },
    ],
  },
];

type TableStat = { tbl: string; approx_rows: number };

function classifyTable(name: string): string {
  for (const p of PROJECTS) {
    if ((p.exactTables ?? []).includes(name)) return p.id;
    if (p.tablePrefixes.some(pfx => name.startsWith(pfx))) return p.id;
  }
  return 'shared';
}

/* ─── Component ─────────────────────────────────────────────────────── */
export default function Infrastructure() {
  const [activeProject, setActiveProject] = useState('axe-core');
  const [tables, setTables] = useState<TableStat[]>([]);
  const [liveStates, setLiveStates] = useState<Record<string, ServiceState>>({});
  const [loading, setLoading] = useState(true);
  const [checking, setChecking] = useState(false);
  const [lastCheck, setLastCheck] = useState<Date | null>(null);
  const [tableSearch, setTableSearch] = useState('');

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const sb = requireSupabase();
      const { data } = await sb.rpc('get_table_stats');
      if (data) setTables(data as TableStat[]);
    } catch (e) { console.warn('table stats rpc failed', e); }

    const states = await getSystemState();
    const map: Record<string, ServiceState> = {};
    for (const s of states) map[s.service] = s;
    setLiveStates(map);
    setLastCheck(new Date());
    setLoading(false);
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  const runCheck = useCallback(async () => {
    setChecking(true);
    await checkAllServices();
    await loadData();
    setChecking(false);
  }, [loadData]);

  const project = PROJECTS.find(p => p.id === activeProject)!;
  const projectTables = tables.filter(t => classifyTable(t.tbl) === activeProject);
  const filteredTables = projectTables.filter(t => tableSearch === '' || t.tbl.toLowerCase().includes(tableSearch.toLowerCase()));
  const totalRows = projectTables.reduce((s, t) => s + t.approx_rows, 0);

  // Count tables per project for sidebar
  const projectCounts: Record<string, number> = {};
  for (const t of tables) {
    const pid = classifyTable(t.tbl);
    projectCounts[pid] = (projectCounts[pid] ?? 0) + 1;
  }

  // Service state for current project
  const projectServiceKeys: Record<string, string[]> = {
    'axe-core':      ['supabase', 'livekit', 'n8n', 'langgraph', 'terminal', 'github', 'ollama', 'openrouter', 'gemini', 'xai', 'google_maps', 'smartthings', 'openhands', 'openjarvis', 'openclaw', 'kilocode', 'crewai', 'hermes'],
    'axe-companion': ['supabase', 'metaapi', 'axe_companion', 'ollama'],
    'trading-os':    ['supabase', 'metaapi', 'trading_os'],
    'axe-intel':     ['supabase', 'axe_intel'],
    'shared':        ['supabase'],
  };

  return (
    <motion.div className="h-full flex flex-col" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.3 }}>
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-3 flex-shrink-0" style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
        <div>
          <h1 className="text-page-title font-semibold" style={{ color: 'var(--text-primary)' }}>Infrastructure</h1>
          <p className="text-xs-custom" style={{ color: 'var(--text-muted)' }}>
            {tables.length} tables · {PROJECTS.length - 1} projects · {lastCheck ? `updated ${lastCheck.toLocaleTimeString()}` : loading ? 'loading…' : ''}
          </p>
        </div>
        <button onClick={runCheck} disabled={checking} className="px-3 py-1 rounded-lg text-xs font-mono transition-all" style={{ background: checking ? 'rgba(34,211,238,0.05)' : 'rgba(34,211,238,0.1)', color: checking ? 'rgba(34,211,238,0.4)' : '#22D3EE', border: '1px solid rgba(34,211,238,0.2)' }}>
          {checking ? 'checking…' : '↻ health check'}
        </button>
      </div>

      <div className="flex flex-1 min-h-0">
        {/* Left sidebar — project list */}
        <div className="flex flex-col gap-1 p-3 flex-shrink-0 overflow-y-auto" style={{ width: 200, borderRight: '1px solid rgba(255,255,255,0.04)' }}>
          <p className="text-[9px] uppercase tracking-widest mb-1" style={{ color: 'var(--text-muted)' }}>Projects</p>
          {PROJECTS.map(p => (
            <button key={p.id} onClick={() => setActiveProject(p.id)}
              className="flex items-center gap-2 px-2.5 py-2 rounded-lg text-left transition-all"
              style={{ background: activeProject === p.id ? `${p.color}18` : 'transparent', border: activeProject === p.id ? `1px solid ${p.color}30` : '1px solid transparent' }}>
              <span style={{ color: p.color, fontSize: 12 }}>{p.emoji}</span>
              <div className="flex-1 min-w-0">
                <div className="text-xs font-medium truncate" style={{ color: activeProject === p.id ? p.color : 'var(--text-primary)' }}>{p.name}</div>
                <div className="text-[9px]" style={{ color: 'var(--text-muted)' }}>{projectCounts[p.id] ?? 0} tables</div>
              </div>
            </button>
          ))}

          {/* System health mini list */}
          <p className="text-[9px] uppercase tracking-widest mt-4 mb-1" style={{ color: 'var(--text-muted)' }}>Services</p>
          {Object.entries(liveStates).slice(0, 8).map(([key, s]) => (
            <div key={key} className="flex items-center justify-between px-2 py-1">
              <span className="text-[10px] truncate" style={{ color: 'var(--text-muted)' }}>{s.display}</span>
              <span className="rounded-full" style={{ width: 6, height: 6, display: 'inline-block', background: s.status === 'online' ? '#10B981' : s.status === 'degraded' ? '#F59E0B' : '#6B7280', flexShrink: 0 }} />
            </div>
          ))}
        </div>

        {/* Main content */}
        <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
          <AnimatePresence mode="wait">
            <motion.div key={activeProject} initial={{ opacity: 0, x: 10 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.2 }} className="flex-1 flex flex-col min-h-0 p-5 gap-4 overflow-y-auto">

              {/* Project header */}
              <div className="flex items-start justify-between">
                <div>
                  <div className="flex items-center gap-2.5">
                    <span style={{ color: project.color, fontSize: 20 }}>{project.emoji}</span>
                    <h2 className="text-lg font-semibold" style={{ color: project.color }}>{project.name}</h2>
                    <span className="rounded-full px-2 py-0.5 text-[9px] font-mono" style={{ background: `${project.color}18`, color: project.color }}>{projectTables.length} tables</span>
                  </div>
                  <p className="text-xs mt-0.5 ml-7" style={{ color: 'var(--text-muted)' }}>{project.description}</p>
                  {project.url && <p className="text-[10px] ml-7 mt-0.5 font-mono" style={{ color: 'var(--text-muted)' }}>{project.url}</p>}
                </div>
                <div className="text-right">
                  <div className="text-lg font-mono font-bold" style={{ color: project.color }}>{totalRows.toLocaleString()}</div>
                  <div className="text-[9px]" style={{ color: 'var(--text-muted)' }}>total rows</div>
                </div>
              </div>

              {/* Tech stack */}
              <div>
                <p className="text-[9px] uppercase tracking-widest mb-2" style={{ color: 'var(--text-muted)' }}>Tech Stack</p>
                <div className="flex flex-wrap gap-2">
                  {project.stack.map(s => {
                    const serviceKey = s.name.toLowerCase().replace(/\s+/g, '_');
                    const live = liveStates[serviceKey] ?? liveStates[s.name.toLowerCase()];
                    const isOnline = live?.status === 'online';
                    return (
                      <div key={s.name} className="flex items-center gap-2 px-3 py-2 rounded-lg" style={{ background: `${s.color}10`, border: `1px solid ${s.color}25` }}>
                        <span className="rounded-full" style={{ width: 6, height: 6, background: live ? (isOnline ? '#10B981' : '#F59E0B') : s.color, flexShrink: 0 }} />
                        <span className="text-xs font-medium" style={{ color: s.color }}>{s.name}</span>
                        {live?.latency_ms != null && <span className="text-[9px] font-mono" style={{ color: 'var(--text-muted)' }}>{live.latency_ms}ms</span>}
                        {s.note && <span className="text-[9px] truncate max-w-24" style={{ color: 'var(--text-muted)' }}>{s.note}</span>}
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Services from core_system_state for this project */}
              {(projectServiceKeys[activeProject] ?? []).length > 0 && (
                <div>
                  <p className="text-[9px] uppercase tracking-widest mb-2" style={{ color: 'var(--text-muted)' }}>Live Service Status</p>
                  <div className="grid grid-cols-2 gap-2">
                    {(projectServiceKeys[activeProject] ?? []).map(key => {
                      const s = liveStates[key];
                      if (!s) return null;
                      return (
                        <div key={key} className="flex items-center justify-between px-3 py-2 rounded-lg" style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)' }}>
                          <div>
                            <div className="text-xs" style={{ color: 'var(--text-primary)' }}>{s.display}</div>
                            {s.latency_ms != null && <div className="text-[9px] font-mono" style={{ color: 'var(--text-muted)' }}>{s.latency_ms}ms</div>}
                          </div>
                          <span className="rounded-full" style={{ width: 8, height: 8, background: s.status === 'online' ? '#10B981' : s.status === 'degraded' ? '#F59E0B' : '#EF4444', boxShadow: s.status === 'online' ? '0 0 6px #10B981' : 'none' }} />
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              <SystemRegistryPanel />

              {/* Tables */}
              <div className="flex-1 min-h-0">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-[9px] uppercase tracking-widest" style={{ color: 'var(--text-muted)' }}>Database Tables</p>
                  <input value={tableSearch} onChange={e => setTableSearch(e.target.value)} placeholder="filter tables…" className="text-[10px] px-2 py-1 rounded" style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', color: 'var(--text-primary)', outline: 'none', width: 140 }} />
                </div>
                {loading ? (
                  <div className="flex items-center justify-center py-8" style={{ color: 'var(--text-muted)' }}>
                    <span className="text-xs">Loading tables…</span>
                  </div>
                ) : filteredTables.length === 0 ? (
                  <div className="text-xs py-4 text-center" style={{ color: 'var(--text-muted)' }}>No tables found</div>
                ) : (
                  <div className="grid grid-cols-1 gap-1 max-h-80 overflow-y-auto pr-1">
                    {filteredTables.map(t => (
                      <div key={t.tbl} className="flex items-center justify-between px-3 py-1.5 rounded" style={{ background: 'var(--bg-surface)' }}>
                        <span className="text-[11px] font-mono" style={{ color: 'var(--text-primary)' }}>{t.tbl}</span>
                        <span className="text-[10px] font-mono ml-2" style={{ color: t.approx_rows > 0 ? project.color : 'var(--text-muted)' }}>
                          {t.approx_rows.toLocaleString()}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

            </motion.div>
          </AnimatePresence>
        </div>
      </div>
    </motion.div>
  );
}
