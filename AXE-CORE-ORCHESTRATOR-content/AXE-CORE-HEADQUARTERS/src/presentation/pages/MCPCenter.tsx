import { useEffect, useState } from 'react';
import { TabRail } from '@/presentation/components/layout/useTabRail';
import { motion } from 'framer-motion';
import { WidgetCard } from '@/presentation/components/widgets/WidgetCard';
import { StatusBadge } from '@/presentation/components/widgets/StatusBadge';
import { ExternalLink, Check, X, RefreshCw, Play, Wrench, Plus, Trash2 } from 'lucide-react';
import {
  mcpHubLijst, mcpHubRoep, mcpHubSleutel, mcpHubTest, mcpHubVerwijder, mcpHubVoegToe,
  type McpHubServer, type McpHubSjabloon, type McpHubTest,
} from '@/infrastructure/gateways/axeCoreApiService';
import { LIST_GRID, STAT_ROW } from '@/presentation/components/surface/Page';
import { gemiddelde, toonGetal } from '@/domain/gemiddelde';

/**
 * MCP Center: echte MCP-verbindingen, via de hub op de agent-host.
 *
 * Tot 14 september kon deze tab niets verbinden: de lijst had verzonnen
 * startcommando's, "Test" was een gewone GET en een tool aanroepen ging naar
 * een pad dat in MCP niet bestaat. Nu opent de hub (backend/axe_api/mcp_hub.py)
 * een echte MCP-sessie: initialize, tools/list, tools/call.
 *
 * Een sleutel die je hier invult gaat naar de agent-host en blijft daar
 * (~/.axe/mcp-sleutels.env, alleen voor jou leesbaar). Hij komt nooit terug
 * naar deze pagina: je ziet alleen WAAR hij vandaan komt.
 */

type Categorie = McpHubServer['categorie'];

const CATEGORY_COLORS: Record<Categorie, string> = {
  ai: 'var(--accent-cyan)', infra: '#8B5CF6', storage: '#3ECF8E', comms: 'var(--warning)', dev: '#3B82F6',
};

type Stand = { test?: McpHubTest; bezig?: boolean };

export default function MCPCenter() {
  const [servers, setServers] = useState<McpHubServer[]>([]);
  const [sjablonen, setSjablonen] = useState<McpHubSjabloon[]>([]);
  /* Nog een project of account toevoegen: welk sjabloon, welke naam, welke velden. */
  const [nieuw, setNieuw] = useState<{ sjabloon: string; label: string; velden: Record<string, string> } | null>(null);
  const [nieuwFout, setNieuwFout] = useState<string | null>(null);
  const [standen, setStanden] = useState<Record<string, Stand>>({});
  const [laadFout, setLaadFout] = useState<string | null>(null);
  const [filter, setFilter] = useState<Categorie | 'all' | 'active'>('all');
  const [configuring, setConfiguring] = useState<string | null>(null);
  const [envInput, setEnvInput] = useState('');
  const [toolServer, setToolServer] = useState<string>('');
  const [toolName, setToolName] = useState('');
  const [toolArgs, setToolArgs] = useState('{}');
  const [toolResult, setToolResult] = useState<string | null>(null);

  const testServer = async (id: string) => {
    setStanden(s => ({ ...s, [id]: { ...s[id], bezig: true } }));
    try {
      const test = await mcpHubTest(id);
      setStanden(s => ({ ...s, [id]: { test, bezig: false } }));
    } catch (e) {
      setStanden(s => ({ ...s, [id]: { test: { status: 'offline', fout: e instanceof Error ? e.message : String(e) }, bezig: false } }));
    }
  };

  const laad = async () => {
    try {
      const { servers: lijst, sjablonen: soorten } = await mcpHubLijst();
      setServers(lijst);
      setSjablonen(soorten);
      setLaadFout(null);
      // Wat een sleutel heeft meteen testen: zo zie je bij openen wat werkt.
      for (const s of lijst) if (s.klaar) void testServer(s.id);
    } catch (e) {
      setLaadFout(e instanceof Error ? e.message : 'Agent-host niet bereikbaar');
    }
  };

  // Eén keer bij openen; laad verandert niet van betekenis tussen renders.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { void laad(); }, []);

  const saveConnect = async (id: string) => {
    const waarde = envInput.trim();
    setConfiguring(null);
    setEnvInput('');
    if (!waarde) { void testServer(id); return; }
    setStanden(s => ({ ...s, [id]: { ...s[id], bezig: true } }));
    try {
      const test = await mcpHubSleutel(id, waarde);
      setStanden(s => ({ ...s, [id]: { test, bezig: false } }));
      const { servers: lijst } = await mcpHubLijst();
      setServers(lijst);
    } catch (e) {
      setStanden(s => ({ ...s, [id]: { test: { status: 'offline', fout: e instanceof Error ? e.message : String(e) }, bezig: false } }));
    }
  };

  const voegToe = async () => {
    if (!nieuw) return;
    setNieuwFout(null);
    try {
      const v = await mcpHubVoegToe(nieuw.sjabloon, nieuw.label, nieuw.velden);
      setNieuw(null);
      const { servers: lijst } = await mcpHubLijst();
      setServers(lijst);
      // Meteen de sleutel vragen als die nodig is en er nog geen is.
      if (!v.klaar && v.sleutelnaam) { setConfiguring(v.id); setEnvInput(''); } else void testServer(v.id);
    } catch (e) {
      setNieuwFout(e instanceof Error ? e.message : String(e));
    }
  };

  const verwijder = async (id: string) => {
    await mcpHubVerwijder(id).catch(() => undefined);
    setStanden(s => { const n = { ...s }; delete n[id]; return n; });
    const { servers: lijst } = await mcpHubLijst();
    setServers(lijst);
  };

  const callTool = async () => {
    if (!toolServer || !toolName) return;
    setToolResult(null);
    try {
      const args = JSON.parse(toolArgs);
      const data = await mcpHubRoep(toolServer, toolName, args);
      setToolResult(JSON.stringify(data, null, 2));
    } catch (e) {
      setToolResult(String(e));
    }
  };

  const statusVan = (id: string): 'online' | 'standby' | 'offline' => {
    const t = standen[id]?.test;
    if (!t) return 'standby';
    return t.status === 'online' ? 'online' : t.status === 'offline' ? 'offline' : 'standby';
  };

  const displayed = filter === 'all'
    ? servers
    : filter === 'active'
      ? servers.filter(s => statusVan(s.id) === 'online')
      : servers.filter(s => s.categorie === filter);
  const online = servers.filter(s => statusVan(s.id) === 'online');
  const avgLatency = gemiddelde(online.map(s => standen[s.id]?.test?.latency).filter((l): l is number => typeof l === 'number'));
  const gekozenTools = standen[toolServer]?.test?.tools ?? [];

  return (
    <motion.div className="axe-tabruimte flex min-h-0 flex-1 flex-col pt-5" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
      <div className="flex flex-none items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <button onClick={() => { void laad(); }} className="flex items-center gap-1 px-2 py-1 rounded text-[10px]" style={{ background: 'var(--bg-active)', border: '1px solid var(--border-active)', color: 'var(--text-secondary)' }}>
            <RefreshCw size={10} /> Opnieuw testen
          </button>
          {sjablonen.map(sj => (
            <button key={sj.id}
              onClick={() => { setNieuwFout(null); setNieuw({ sjabloon: sj.id, label: '', velden: Object.fromEntries(sj.velden.map(v => [v.id, ''])) }); }}
              className="flex items-center gap-1 px-2 py-1 rounded text-[10px]"
              style={{ background: 'transparent', border: '1px solid var(--border-subtle)', color: 'var(--text-secondary)' }}>
              <Plus size={10} /> {sj.naam}
            </button>
          ))}
          <a href="https://modelcontextprotocol.io" target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 text-xs-custom" style={{ color: 'var(--accent-cyan)' }}>
            Docs <ExternalLink size={11} />
          </a>
        </div>
        {laadFout && <span className="text-[10px]" style={{ color: 'var(--error)' }}>Agent-host niet bereikbaar: {laadFout}</span>}
      </div>

      {nieuw && (
        <div className="flex-none mb-3">
          <WidgetCard title={`NIEUWE ${sjablonen.find(sj => sj.id === nieuw.sjabloon)?.naam.toUpperCase() ?? ''}-VERBINDING`}>
            <div className="flex flex-wrap items-center gap-1.5">
              <input autoFocus value={nieuw.label} onChange={e => setNieuw({ ...nieuw, label: e.target.value })}
                placeholder="Naam (bijv. Companion, Axon, account 2)"
                className="flex-1 min-w-[10rem] text-[10px] px-2 py-1 rounded"
                style={{ background: 'var(--bg-base)', border: '1px solid var(--border-active)', color: 'var(--text-primary)' }} />
              {sjablonen.find(sj => sj.id === nieuw.sjabloon)?.velden.map(veld => (
                <input key={veld.id} value={nieuw.velden[veld.id] ?? ''}
                  onChange={e => setNieuw({ ...nieuw, velden: { ...nieuw.velden, [veld.id]: e.target.value } })}
                  onKeyDown={e => { if (e.key === 'Enter') void voegToe(); }}
                  placeholder={veld.label}
                  className="flex-1 min-w-[10rem] text-[10px] px-2 py-1 rounded font-mono-data"
                  style={{ background: 'var(--bg-base)', border: '1px solid var(--border-active)', color: 'var(--text-primary)' }} />
              ))}
              <button onClick={() => { void voegToe(); }} className="px-2 py-1 rounded" style={{ background: 'var(--accent-cyan)', color: '#000' }}><Check size={11} /></button>
              <button onClick={() => setNieuw(null)} className="px-2 py-1 rounded" style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', color: 'var(--text-muted)' }}><X size={11} /></button>
            </div>
            {nieuwFout && <div className="mt-1 text-[10px]" style={{ color: 'var(--error)' }}>{nieuwFout}</div>}
          </WidgetCard>
        </div>
      )}

      <div className={`${STAT_ROW} flex-none`}>
        {[
          { label: 'Connected', val: online.length },
          { label: 'Avg Latency', val: toonGetal(avgLatency, 'ms') },
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

      <TabRail kant="links">
        <div className="axe-paneel">
          <h2 className="axe-paneel-kop">Categorie</h2>
          <div className="axe-paneel-body">
            <div className="flex gap-1.5 mb-4 flex-wrap">
              {(['active', 'all', 'ai', 'infra', 'storage', 'comms', 'dev'] as const).map(cat => (
                <button
                  key={cat}
                  onClick={() => setFilter(cat)}
                  className="text-xs-custom px-2.5 py-1 rounded-md transition-all"
                  style={{
                    background: 'transparent',
                    color: filter === cat
                      ? (cat === 'all' || cat === 'active' ? 'var(--accent-cyan)' : CATEGORY_COLORS[cat])
                      : 'var(--text-muted)',
                    border: '1px solid var(--border-subtle)',
                  }}
                >
                  {cat.charAt(0).toUpperCase() + cat.slice(1)}
                </button>
              ))}
            </div>
          </div>
        </div>
      </TabRail>

      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className={LIST_GRID}>
          {displayed.map((server, i) => {
            const stand = standen[server.id];
            const t = stand?.test;
            const kleur = CATEGORY_COLORS[server.categorie];
            return (
              <motion.div key={server.id} className="h-full" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.03 }}>
                <WidgetCard title="" className="h-full">
                  <div>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2.5">
                        <div className="rounded-lg flex items-center justify-center font-mono-data text-[9px] font-bold"
                          style={{ width: 32, height: 32, background: `${kleur}15`, color: kleur, border: `1px solid ${kleur}30` }}>
                          {server.naam.slice(0, 2).toUpperCase()}
                        </div>
                        <div>
                          <span className="text-small font-medium" style={{ color: 'var(--text-primary)' }}>{server.naam}</span>
                          <div className="flex items-center gap-1.5">
                            <span className="text-[9px]" style={{ color: kleur }}>{server.categorie}</span>
                            {server.transport === 'stdio' && <span className="text-[9px]" style={{ color: 'var(--text-muted)' }}>op deze Mac</span>}
                            {Object.values(server.velden).filter(Boolean).map(w => <span key={w} className="text-[9px] font-mono-data" style={{ color: 'var(--text-muted)' }}>{w}</span>)}
                            {t?.latency != null && t.status === 'online' && <span className="text-[9px] font-mono-data" style={{ color: 'var(--text-muted)' }}>{t.latency}ms</span>}
                            {t?.tools && <span className="text-[9px] font-mono-data" style={{ color: 'var(--text-muted)' }}>{t.tools.length} tools</span>}
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <StatusBadge variant={statusVan(server.id)} size="sm" />
                        {server.sleutelnaam && (
                          <button onClick={() => { setConfiguring(server.id); setEnvInput(''); }} className="text-[10px] px-2 py-0.5 rounded" style={{ background: 'var(--bg-hover)', border: '1px solid var(--border-active)', color: 'var(--accent-cyan)' }}>
                            {server.klaar ? 'Sleutel' : 'Connect'}
                          </button>
                        )}
                        <button onClick={() => { void testServer(server.id); }} disabled={stand?.bezig} className="text-[10px] px-2 py-0.5 rounded" style={{ background: 'var(--bg-hover)', border: '1px solid var(--border-active)', color: 'var(--text-secondary)' }}>
                          {stand?.bezig ? '...' : 'Test'}
                        </button>
                        {server.extra && (
                          <button onClick={() => { void verwijder(server.id); }} title="Verbinding verwijderen" className="text-[10px] px-1.5 py-0.5 rounded" style={{ background: 'var(--bg-hover)', border: '1px solid var(--border-subtle)', color: 'var(--text-muted)' }}>
                            <Trash2 size={10} />
                          </button>
                        )}
                        <a href={server.docs} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--text-muted)' }}><ExternalLink size={11} /></a>
                      </div>
                    </div>

                    <div className="mt-1.5 text-[10px]" style={{ color: 'var(--text-muted)' }}>
                      {server.uitleg}
                      {server.sleutelnaam && <> · sleutel: {server.klaar ? server.sleutel : <span style={{ color: 'var(--warning)' }}>ontbreekt ({server.sleutelnaam})</span>}</>}
                    </div>
                    {t?.fout && <div className="mt-1 text-[10px]" style={{ color: 'var(--error)' }}>{t.fout}</div>}

                    {configuring === server.id && server.sleutelnaam && (
                      <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} className="mt-2.5 overflow-hidden">
                        <div className="flex gap-1.5">
                          <input
                            autoFocus
                            type="password"
                            value={envInput}
                            onChange={e => setEnvInput(e.target.value)}
                            onKeyDown={e => { if (e.key === 'Enter') void saveConnect(server.id); if (e.key === 'Escape') setConfiguring(null); }}
                            placeholder={server.sleutelnaam}
                            className="flex-1 text-[10px] px-2 py-1 rounded"
                            style={{ background: 'var(--bg-base)', border: '1px solid var(--border-active)', color: 'var(--text-primary)' }}
                          />
                          <button onClick={() => { void saveConnect(server.id); }} className="px-2 py-1 rounded" style={{ background: 'var(--accent-cyan)', color: '#000' }}><Check size={11} /></button>
                          <button onClick={() => setConfiguring(null)} className="px-2 py-1 rounded" style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', color: 'var(--text-muted)' }}><X size={11} /></button>
                        </div>
                        <div className="mt-1 text-[9px]" style={{ color: 'var(--text-muted)' }}>
                          Wordt bewaard op de agent-host (alleen voor jou leesbaar) en daarna meteen getest.
                        </div>
                      </motion.div>
                    )}
                  </div>
                </WidgetCard>
              </motion.div>
            );
          })}
        </div>

        <div className="mt-6">
          <WidgetCard title="MCP TOOL TESTER" headerAction={<Wrench size={12} style={{ color: 'var(--text-muted)' }} />}>
            <div className="space-y-2">
              <div className="flex gap-2">
                <select value={toolServer} onChange={e => { setToolServer(e.target.value); setToolName(''); }} className="text-[11px] px-2 py-1 rounded" style={{ background: 'var(--bg-base)', border: '1px solid var(--border-subtle)', color: 'var(--text-primary)' }}>
                  <option value="">Select server...</option>
                  {online.map(s => <option key={s.id} value={s.id}>{s.naam}</option>)}
                </select>
                <input list="mcp-tools" value={toolName} onChange={e => setToolName(e.target.value)} placeholder="tool name" className="flex-1 text-[11px] px-2 py-1 rounded" style={{ background: 'var(--bg-base)', border: '1px solid var(--border-subtle)', color: 'var(--text-primary)' }} />
                <datalist id="mcp-tools">
                  {gekozenTools.map(tool => <option key={tool.name} value={tool.name}>{tool.description}</option>)}
                </datalist>
                <button onClick={() => { void callTool(); }} disabled={!toolServer || !toolName} className="px-3 py-1 rounded text-[11px]" style={{ background: 'var(--accent-cyan)', color: '#000' }}>
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
      </div>
    </motion.div>
  );
}
