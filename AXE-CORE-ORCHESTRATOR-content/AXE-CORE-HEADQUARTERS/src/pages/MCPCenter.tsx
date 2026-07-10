import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { WidgetCard } from '@/components/widgets/WidgetCard';
import { StatusBadge } from '@/components/widgets/StatusBadge';
import { ExternalLink, Plus, Settings, Check, X, RefreshCw, Play, Wrench } from 'lucide-react';
import {
  type MCPServer,
  getDefaultMcpServers,
  loadMcpServers,
  saveMcpServers,
} from '@/services/mcpRegistryService';
import { isAxeApiConfigured, sbGetRows, sbInsertRow } from '@/services/axeCoreApiService';

const CATEGORY_COLORS: Record<MCPServer['category'], string> = {
  ai: '#22D3EE', infra: '#8B5CF6', storage: '#3ECF8E', comms: '#F59E0B', dev: '#3B82F6',
};

export default function MCPCenter() {
  const [servers, setServers] = useState<MCPServer[]>([]);
  const [filter, setFilter] = useState<MCPServer['category'] | 'all' | 'active'>('active');
  const [configuring, setConfiguring] = useState<string | null>(null);
  const [envInput, setEnvInput] = useState('');
  const [testing, setTesting] = useState<string | null>(null);
  const [toolServer, setToolServer] = useState<string>('');
  const [toolName, setToolName] = useState('');
  const [toolArgs, setToolArgs] = useState('{}');
  const [toolResult, setToolResult] = useState<string | null>(null);

  useEffect(() => {
    loadMcpServers().then(setServers).catch(() => {});
  }, []);

  const refreshFromBackend = async () => {
    if (!isAxeApiConfigured) return;
    try {
      const rows = (await sbGetRows('core_mcp_servers', { limit: 100, orderBy: 'display_name', orderDir: 'asc' })) as any[];
      if (rows?.length) {
        const mapped: MCPServer[] = rows.map((r: any) => ({
          id: r.name,
          name: r.display_name || r.name,
          category: (r.metadata?.category || 'dev') as MCPServer['category'],
          status: (r.status === 'active' ? 'online' : r.status === 'configured' ? 'standby' : 'not-linked') as MCPServer['status'],
          version: r.metadata?.version,
          latency: r.metadata?.latency ?? null,
          docsUrl: r.metadata?.docsUrl || 'https://modelcontextprotocol.io',
          envKey: r.metadata?.envKey,
        }));
        setServers(mapped);
        saveMcpServers(mapped).catch(() => {});
      }
    } catch { /* ignore */ }
  };

  const testBackend = async (id: string) => {
    setTesting(id);
    try {
      const res = await fetch('/api/mcp/servers/' + encodeURIComponent(id) + '/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${import.meta.env.VITE_AXE_API_KEY}` },
      });
      const data = await res.json();
      const updated: MCPServer[] = servers.map(s =>
        s.id === id ? { ...s, status: data.status === 'online' ? 'online' : data.status === 'degraded' ? 'standby' : 'not-linked', latency: data.latency } : s
      );
      setServers(updated);
      saveMcpServers(updated).catch(() => {});
    } catch { /* ignore */ }
    setTesting(null);
  };

  const connect = (id: string) => {
    const s = servers.find(s => s.id === id);
    if (!s) return;
    setConfiguring(id);
    setEnvInput('');
  };

  const saveConnect = (id: string) => {
    const updated: MCPServer[] = servers.map(s =>
      s.id === id ? { ...s, status: 'online' as const, latency: Math.floor(Math.random() * 80 + 10) } : s
    );
    setServers(updated);
    saveMcpServers(updated).catch(() => {});
    setConfiguring(null);
  };

  const disconnect = (id: string) => {
    const updated: MCPServer[] = servers.map(s => s.id === id ? { ...s, status: 'not-linked' as const, latency: null } : s);
    setServers(updated);
    saveMcpServers(updated).catch(() => {});
  };

  const callTool = async () => {
    if (!toolServer || !toolName) return;
    setToolResult(null);
    try {
      const args = JSON.parse(toolArgs);
      const res = await fetch('/api/mcp/tools/call', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${import.meta.env.VITE_AXE_API_KEY}` },
        body: JSON.stringify({ server_name: toolServer, tool_name: toolName, arguments: args }),
      });
      const data = await res.json();
      setToolResult(JSON.stringify(data, null, 2));
    } catch (e) {
      setToolResult(String(e));
    }
  };

  const displayed = filter === 'all'
    ? servers
    : filter === 'active'
      ? servers.filter(s => s.status !== 'not-linked')
      : servers.filter(s => s.category === filter);
  const online = servers.filter(s => s.status === 'online').length;
  const avgLatency = Math.round(servers.filter(s => s.latency).reduce((a, s) => a + (s.latency ?? 0), 0) / servers.filter(s => s.latency).length);

  return (
    <motion.div className="p-5 h-full overflow-y-auto" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-page-title font-semibold" style={{ color: 'var(--text-primary)' }}>MCP Center</h1>
          <p className="text-xs-custom" style={{ color: 'var(--text-muted)' }}>Model Context Protocol — {online}/{servers.length} connected</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={refreshFromBackend} className="flex items-center gap-1 px-2 py-1 rounded text-[10px]" style={{ background: 'var(--bg-active)', border: '1px solid var(--border-active)', color: 'var(--text-secondary)' }}>
            <RefreshCw size={10} /> Sync
          </button>
          <a href="https://modelcontextprotocol.io" target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 text-xs-custom" style={{ color: 'var(--accent-cyan)' }}>
            Docs <ExternalLink size={11} />
          </a>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-4">
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
        {(['active', 'all', 'ai', 'infra', 'storage', 'comms', 'dev'] as const).map(cat => (
          <button
            key={cat}
            onClick={() => setFilter(cat)}
            className="text-xs-custom px-2.5 py-1 rounded-md transition-all"
            style={{
              background: filter === cat ? (cat === 'all' || cat === 'active' ? 'var(--accent-cyan)' : CATEGORY_COLORS[cat as MCPServer['category']]) : 'var(--bg-surface)',
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
                    <button onClick={() => testBackend(server.id)} disabled={testing === server.id} className="text-[10px] px-2 py-0.5 rounded" style={{ background: 'var(--bg-hover)', border: '1px solid var(--border-active)', color: 'var(--text-secondary)' }}>
                      {testing === server.id ? '...' : 'Test'}
                    </button>
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

      {/* Tool tester */}
      <div className="mt-6">
        <WidgetCard title="MCP TOOL TESTER" headerAction={<Wrench size={12} style={{ color: 'var(--text-muted)' }} />}>
          <div className="space-y-2">
            <div className="flex gap-2">
              <select value={toolServer} onChange={e => setToolServer(e.target.value)} className="text-[11px] px-2 py-1 rounded" style={{ background: 'var(--bg-base)', border: '1px solid var(--border-subtle)', color: 'var(--text-primary)' }}>
                <option value="">Select server...</option>
                {servers.filter(s => s.status === 'online').map(s => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
              <input value={toolName} onChange={e => setToolName(e.target.value)} placeholder="tool name" className="flex-1 text-[11px] px-2 py-1 rounded" style={{ background: 'var(--bg-base)', border: '1px solid var(--border-subtle)', color: 'var(--text-primary)' }} />
              <button onClick={callTool} disabled={!toolServer || !toolName} className="px-3 py-1 rounded text-[11px]" style={{ background: 'var(--accent-cyan)', color: '#000' }}>
                <Play size={10} className="inline mr-1" />Run
              </button>
            </div>
            <textarea value={toolArgs} onChange={e => setToolArgs(e.target.value)} rows={3} className="w-full text-[10px] px-2 py-1 rounded font-mono" style={{ background: 'var(--bg-base)', border: '1px solid var(--border-subtle)', color: 'var(--text-primary)' }} placeholder='{"arg": "value"}' />
            {toolResult && (
              <pre className="text-[10px] p-2 rounded overflow-x-auto" style={{ background: '#030505', border: '1px solid rgba(255,255,255,0.06)', color: 'rgba(165,243,252,0.8)' }}>{toolResult}</pre>
            )}
          </div>
        </WidgetCard>
      </div>
    </motion.div>
  );
}
