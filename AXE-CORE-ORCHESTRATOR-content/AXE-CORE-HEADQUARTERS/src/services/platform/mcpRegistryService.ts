import { getSupabase } from '@/core/supabase/client';
import { loadSetting, saveSetting } from '@/services/platform/userSettingsService';

export interface MCPServer {
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
  { id: 'supabase',   name: 'Supabase',        category: 'storage', status: 'not-linked', latency: null, version: '1.0.0', docsUrl: 'https://supabase.com/docs/guides/getting-started/mcp', envKey: 'SUPABASE_URL' },
  { id: 'openrouter', name: 'OpenRouter MCP',  category: 'ai',      status: 'not-linked', latency: null, version: '1.0.0', docsUrl: 'https://openrouter.ai/docs/features/mcp',              envKey: 'OPENROUTER_API_KEY' },
  { id: 'railway',    name: 'Railway',         category: 'infra',   status: 'not-linked', latency: null, version: '1.0.0', docsUrl: 'https://docs.railway.app/mcp',                       envKey: 'RAILWAY_TOKEN' },
  { id: 'resend',     name: 'Resend',          category: 'comms',   status: 'not-linked', latency: null, version: '1.0.0', docsUrl: 'https://resend.com/docs/mcp',                         envKey: 'RESEND_API_KEY' },
  { id: 'vercel',     name: 'Vercel',          category: 'infra',   status: 'not-linked', latency: null, version: '1.0.0', docsUrl: 'https://vercel.com/docs/mcp',                         envKey: 'VERCEL_TOKEN' },
  { id: 'cloudflare', name: 'Cloudflare',      category: 'infra',   status: 'not-linked', latency: null, version: '1.0.0', docsUrl: 'https://developers.cloudflare.com/mcp',               envKey: 'CF_API_TOKEN' },
  { id: 'github',     name: 'GitHub',          category: 'dev',     status: 'not-linked', latency: null, version: '1.5.0', docsUrl: 'https://github.com/modelcontextprotocol/servers',     envKey: 'GITHUB_TOKEN' },
  { id: 'filesystem', name: 'Filesystem',      category: 'dev',     status: 'not-linked', latency: null, version: '1.2.0', docsUrl: 'https://modelcontextprotocol.io',                    envKey: '' },
  { id: 'browser',    name: 'Browser',         category: 'dev',     status: 'not-linked', latency: null, version: '2.0.1', docsUrl: 'https://modelcontextprotocol.io',                    envKey: '' },
  { id: 'postgres',   name: 'PostgreSQL',      category: 'storage', status: 'not-linked', latency: null, version: '1.4.0', docsUrl: 'https://modelcontextprotocol.io',                    envKey: 'DATABASE_URL' },
];

type CoreMcpRow = {
  id: string;
  name: string;
  display_name: string;
  description: string | null;
  transport: string | null;
  command: string | null;
  url: string | null;
  capabilities: string[] | null;
  status: string | null;
  metadata: Record<string, unknown> | null;
};

function coerceStatus(status: string | null | undefined): MCPServer['status'] {
  if (status === 'online' || status === 'standby' || status === 'not-linked') return status;
  if (status === 'active') return 'online';
  if (status === 'configured') return 'standby';
  return 'not-linked';
}

function toDbRow(server: MCPServer) {
  return {
    name: server.id,
    display_name: server.name,
    description: `${server.category} MCP server`,
    transport: 'stdio',
    command: server.envKey ? `npx ${server.id}` : null,
    url: null,
    capabilities: [server.category],
    status: server.status === 'online' ? 'active' : server.status === 'standby' ? 'configured' : 'not_configured',
    metadata: {
      category: server.category,
      version: server.version ?? null,
      latency: server.latency ?? null,
      docsUrl: server.docsUrl,
      envKey: server.envKey ?? null,
    },
  };
}

function fromDbRow(row: CoreMcpRow): MCPServer {
  const meta = row.metadata ?? {};
  return {
    id: row.name,
    name: row.display_name || row.name,
    category: (meta.category as MCPServer['category']) ?? 'dev',
    status: coerceStatus(row.status),
    version: (meta.version as string | null | undefined) ?? undefined,
    latency: typeof meta.latency === 'number' ? meta.latency : null,
    docsUrl: (meta.docsUrl as string | undefined) ?? 'https://modelcontextprotocol.io',
    envKey: (meta.envKey as string | null | undefined) ?? undefined,
  };
}

function mergeWithDefaults(servers: MCPServer[]): MCPServer[] {
  const byId = new Map(servers.map(server => [server.id, server]));
  return DEFAULT_SERVERS.map(defaultServer => ({
    ...defaultServer,
    ...(byId.get(defaultServer.id) ?? {}),
  }));
}

function loadLocalMcpServers(): MCPServer[] {
  try {
    const raw = localStorage.getItem('axe_mcp_servers');
    if (!raw) return DEFAULT_SERVERS;
    const parsed = JSON.parse(raw) as MCPServer[];
    return Array.isArray(parsed) && parsed.length ? parsed : DEFAULT_SERVERS;
  } catch {
    return DEFAULT_SERVERS;
  }
}

export function getDefaultMcpServers(): MCPServer[] {
  return DEFAULT_SERVERS;
}

export async function loadMcpServers(): Promise<MCPServer[]> {
  const fallback = await loadSetting<MCPServer[]>('axe_mcp_servers', DEFAULT_SERVERS);
  const local = loadLocalMcpServers();
  const sb = getSupabase();
  if (!sb) return mergeWithDefaults(local.length ? local : fallback);
  try {
    const { data } = await sb.from('core_mcp_servers').select('*').order('display_name');
    if (data?.length) {
      const mapped = mergeWithDefaults(data.map(row => fromDbRow(row as CoreMcpRow)));
      localStorage.setItem('axe_mcp_servers', JSON.stringify(mapped));
      return mapped;
    }
  } catch {
    // fall back to local cache
  }
  return mergeWithDefaults(local.length ? local : fallback);
}

export async function saveMcpServers(servers: MCPServer[]): Promise<void> {
  const merged = mergeWithDefaults(servers);
  localStorage.setItem('axe_mcp_servers', JSON.stringify(merged));
  void saveSetting('axe_mcp_servers', merged);

  const sb = getSupabase();
  if (!sb) return;
  try {
    const rows = merged.map(toDbRow);
    await sb.from('core_mcp_servers').upsert(rows, { onConflict: 'name' });
  } catch {
    // Ignore, local persistence still succeeded.
  }
}
