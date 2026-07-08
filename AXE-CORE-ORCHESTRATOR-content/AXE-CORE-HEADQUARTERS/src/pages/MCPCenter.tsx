import { useState } from 'react';
import { motion } from 'framer-motion';
import { WidgetCard } from '@/components/widgets/WidgetCard';
import { StatusBadge } from '@/components/widgets/StatusBadge';
import { ExternalLink, Plus, Settings, Check, X } from 'lucide-react';
import { saveSetting } from '@/services/userSettingsService';

interface MCPServer {
  id: string;
  name: string;
  category: 'ai' | 'infra' | 'storage' | 'comms' | 'dev';
  status: 'online' | 'standby' | 'not-linked';
  version?: string;
  latency?: number | null;
  docsUrl: string;
  envKey?: string;
}

const DEFAULT_SERVERS: MCPServer[] = [
  { id: 'filesystem', name: 'Filesystem',  category: 'dev',     status: 'online',     latency: 12,   version: '1.2.0', docsUrl: 'https://modelcontextprotocol.io', envKey: '' },
  { id: 'browser',    name: 'Browser',     category: 'dev',     status: 'online',     latency: 45,   version: '2.0.1', docsUrl: 'https://modelcontextprotocol.io', envKey: '' },
  { id: 'github',     name: 'GitHub',      category: 'dev',     status: 'online',     latency: 89,   version: '1.5.0', docsUrl: 'https://github.com/modelcontextprotocol/servers', envKey: 'GITHUB_TOKEN' },
  { id: 'slack',      name: 'Slack',       category: 'comms',   status: 'standby',    latency: null, version: '1.0.3', docsUrl: 'https://modelcontextprotocol.io', envKey: 'SLACK_TOKEN' },
  { id: 'notion',     name: 'Notion',      category: 'storage', status: 'online',     latency: 67,   version: '1.1.0', docsUrl: 'https://modelcontextprotocol.io', envKey: 'NOTION_KEY' },
  { id: 'linear',     name: 'Linear',      category: 'dev',     status: 'online',     latency: 34,   version: '1.3.0', docsUrl: 'https://linear.app', envKey: 'LINEAR_API_KEY' },
  { id: 'discord',    name: 'Discord',     category: 'comms',   status: 'standby',    latency: null, version: '0.9.0', docsUrl: 'https://modelcontextprotocol.io', envKey: 'DISCORD_TOKEN' },
  { id: 'postgres',   name: 'PostgreSQL',  category: 'storage', status: 'online',     latency: 8,    version: '1.4.0', docsUrl: 'https://modelcontextprotocol.io', envKey: 'DATABASE_URL' },
  // ── Newly added ──────────────────────────────────────────────────
  { id: 'supabase',   name: 'Supabase',    category: 'storage', status: 'not-linked', latency: null, version: '1.0.0', docsUrl: 'https://supabase.com/docs/guides/getting-started/mcp', envKey: 'SUPABASE_URL' },
  { id: 'vercel',     name: 'Vercel',      category: 'infra',   status: 'not-linked', latency: null, version: '1.0.0', docsUrl: 'https://vercel.com/docs/mcp', envKey: 'VERCEL_TOKEN' },
  { id: 'cloudflare', name: 'Cloudflare',  category: 'infra',   status: 'not-linked', latency: null, version: '1.0.0', docsUrl: 'https://developers.cloudflare.com/mcp', envKey: 'CF_API_TOKEN' },
  { id: 'railway',    name: 'Railway',     category: 'infra',   status: 'not-linked', latency: null, version: '1.0.0', docsUrl: 'https://docs.railway.app/mcp', envKey: 'RAILWAY_TOKEN' },
  { id: 'resend',     name: 'Resend',      category: 'comms',   status: 'not-linked', latency: null, version: '1.0.0', docsUrl: 'https://resend.com/docs/mcp', envKey: 'RESEND_API_KEY' },
];

function loadServers(): MCPServer[] {
  try { return JSON.parse(localStorage.getItem('axe_mcp_servers') ?? JSON.stringify(DEFAULT_SERVERS)); }
  catch { return DEFAULT_SERVERS; }
}
function saveServers(s: MCPServer[]) {
  localStorage.setItem('axe_mcp_servers', JSON.stringify(s));
  void saveSetting('axe_mcp_servers', s);
}

const CATEGORY_COLORS: Record<MCPServer['category'], string> = {
  ai: '#22D3EE', infra: '#8B5CF6', storage: '#3ECF8E', comms: '#F59E0B', dev: '#3B82F6',
};

export default function MCPCenter() {
  const [servers, setServers] = useState<MCPServer[]>(loadServers);
  const [filter, setFilter] = useState<MCPServer['category'] | 'all'>('all');
  const [configuring, setConfiguring] = useState<string | null>(null);
  const [envInput, setEnvInput] = useState('');

  const connect = (id: string) => {
    const s = servers.find(s => s.id === id);
    if (!s) return;
    setConfiguring(id);
    setEnvInput('');
  };

  const saveConnect = (id: string) => {
    const updated = servers.map(s =>
      s.id === id ? { ...s, status: 'online' as const, latency: Math.floor(Math.random() * 80 + 10) } : s
    );
    setServers(updated);
    saveServers(updated);
    setConfiguring(null);
  };

  const disconnect = (id: string) => {
    const updated = servers.map(s => s.id === id ? { ...s, status: 'not-linked' as const, latency: null } : s);
    setServers(updated);
    saveServers(updated);
  };

  const displayed = filter === 'all' ? servers : servers.filter(s => s.category === filter);
  const online = servers.filter(s => s.status === 'online').length;
  const avgLatency = Math.round(servers.filter(s => s.latency).reduce((a, s) => a + (s.latency ?? 0), 0) / servers.filter(s => s.latency).length);

  return (
    <motion.div className="p-5 h-full overflow-y-auto" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-page-title font-semibold" style={{ color: 'var(--text-primary)' }}>MCP Center</h1>
          <p className="text-xs-custom" style={{ color: 'var(--text-muted)' }}>Model Context Protocol — {online}/{servers.length} connected</p>
        </div>
        <a href="https://modelcontextprotocol.io" target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 text-xs-custom" style={{ color: 'var(--accent-cyan)' }}>
          Docs <ExternalLink size={11} />
        </a>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-3 mb-4">
        {[
          { label: 'Connected', val: online },
          { label: 'Avg Latency', val: `${avgLatency}ms` },
          { label: 'Total Servers', val: servers.length },
        ].map(({ label, val }) => (
          <WidgetCard key={label} title="">
            <div className="text-center py-1">
              <div className="text-xl font-bold font-mono-data" style={{ color: 'var(--accent-cyan)' }}>{val}</div>
              <div className="text-xs-custom" style={{ color: 'var(--text-muted)' }}>{label}</div>
            </div>
          </WidgetCard>
        ))}
      </div>

      {/* Category filter */}
      <div className="flex gap-1.5 mb-4 flex-wrap">
        {(['all', 'ai', 'infra', 'storage', 'comms', 'dev'] as const).map(cat => (
          <button
            key={cat}
            onClick={() => setFilter(cat)}
            className="text-xs-custom px-2.5 py-1 rounded-md transition-all"
            style={{
              background: filter === cat ? (cat === 'all' ? 'var(--accent-cyan)' : CATEGORY_COLORS[cat as MCPServer['category']]) : 'var(--bg-surface)',
              color: filter === cat ? '#000' : 'var(--text-muted)',
              border: '1px solid var(--border-subtle)',
            }}
          >
            {cat.charAt(0).toUpperCase() + cat.slice(1)}
          </button>
        ))}
      </div>

      {/* Server grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
        {displayed.map((server, i) => (
          <motion.div key={server.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.03 }}>
            <WidgetCard title="">
              <div>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2.5">
                    <div className="rounded-lg flex items-center justify-center font-mono-data text-[9px] font-bold"
                      style={{ width: 32, height: 32, background: `${CATEGORY_COLORS[server.category]}15`, color: CATEGORY_COLORS[server.category], border: `1px solid ${CATEGORY_COLORS[server.category]}30` }}>
                      {server.name.slice(0, 2).toUpperCase()}
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-small font-medium" style={{ color: 'var(--text-primary)' }}>{server.name}</span>
                        {server.version && <span className="text-[9px] font-mono-data" style={{ color: 'var(--text-muted)' }}>v{server.version}</span>}
                      </div>
                      <div className="flex items-center gap-1.5">
                        <span className="text-[9px]" style={{ color: CATEGORY_COLORS[server.category] }}>{server.category}</span>
                        {server.latency && <span className="text-[9px] font-mono-data" style={{ color: 'var(--text-muted)' }}>{server.latency}ms</span>}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <StatusBadge variant={server.status === 'not-linked' ? 'standby' : server.status} size="sm" />
                    {server.status !== 'online' ? (
                      <button onClick={() => connect(server.id)} className="text-[10px] px-2 py-0.5 rounded" style={{ background: 'var(--bg-hover)', border: '1px solid var(--border-active)', color: 'var(--accent-cyan)' }}>
                        Connect
                      </button>
                    ) : (
                      <button onClick={() => disconnect(server.id)} className="text-[10px] px-2 py-0.5 rounded" style={{ background: 'var(--bg-hover)', border: '1px solid rgba(255,255,255,0.06)', color: 'var(--text-muted)' }}>
                        <X size={10} />
                      </button>
                    )}
                    <a href={server.docsUrl} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--text-muted)' }}><ExternalLink size={11} /></a>
                  </div>
                </div>

                {configuring === server.id && (
                  <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} className="mt-2.5 overflow-hidden">
                    {server.envKey && (
                      <div className="flex gap-1.5">
                        <input
                          autoFocus
                          type="password"
                          value={envInput}
                          onChange={e => setEnvInput(e.target.value)}
                          onKeyDown={e => { if (e.key === 'Enter') saveConnect(server.id); if (e.key === 'Escape') setConfiguring(null); }}
                          placeholder={server.envKey}
                          className="flex-1 text-[10px] px-2 py-1 rounded"
                          style={{ background: 'var(--bg-base)', border: '1px solid var(--border-active)', color: 'var(--text-primary)' }}
                        />
                        <button onClick={() => saveConnect(server.id)} className="px-2 py-1 rounded" style={{ background: 'var(--accent-cyan)', color: '#000' }}><Check size={11} /></button>
                        <button onClick={() => setConfiguring(null)} className="px-2 py-1 rounded" style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', color: 'var(--text-muted)' }}><X size={11} /></button>
                      </div>
                    )}
                    {!server.envKey && (
                      <div className="flex gap-1.5">
                        <span className="flex-1 text-[10px]" style={{ color: 'var(--text-muted)' }}>No key required · local connection</span>
                        <button onClick={() => saveConnect(server.id)} className="px-2 py-1 rounded text-[10px]" style={{ background: 'var(--accent-cyan)', color: '#000' }}>Connect</button>
                        <button onClick={() => setConfiguring(null)} className="px-2 py-1 rounded" style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', color: 'var(--text-muted)' }}><X size={11} /></button>
                      </div>
                    )}
                  </motion.div>
                )}
              </div>
            </WidgetCard>
          </motion.div>
        ))}
      </div>
    </motion.div>
  );
}
