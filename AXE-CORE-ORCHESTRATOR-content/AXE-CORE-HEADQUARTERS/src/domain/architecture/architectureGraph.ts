/** Brondefinities en live registergegevens blijven te onderscheiden; geen runtime-health afleiden. */
export type ArchitectureKind =
  | 'app'
  | 'agent'
  | 'crew'
  | 'service'
  | 'supabase-project'
  | 'table'
  | 'cloudflare'
  | 'mcp'
  | 'runtime'
  | 'cron'
  | 'provider'
  | 'worker'
  | 'dax'
  | 'coding-seat';

export type ArchitectureDetails = Record<string, string | string[] | number | boolean>;

export interface ArchitectureNode {
  id: string;
  kind: ArchitectureKind;
  label: string;
  appId?: string;
  description?: string;
  details: ArchitectureDetails;
  sources: string[];
}

export interface ArchitectureEdge {
  id: string;
  source: string;
  target: string;
  relation: string;
  label?: string;
  sources: string[];
}

export interface ArchitectureManifest {
  schemaVersion: 1;
  sources: { path: string; kind: string }[];
  nodes: ArchitectureNode[];
  edges: ArchitectureEdge[];
  warnings: string[];
}

export interface ArchitectureSnapshot {
  manifest: ArchitectureManifest;
  live: {
    state: 'connected' | 'partial' | 'offline' | 'unconfigured';
    loadedAt?: string;
    issues: string[];
  };
}

export const ARCHITECTURE_TABLES = [
  'registered_apps',
  'core_agents',
  'core_mcp_servers',
  'core_schedules',
  'core_computer_workers',
  'core_dax_computers',
] as const;

export type ArchitectureTable = typeof ARCHITECTURE_TABLES[number];
export type ArchitectureRows = Partial<Record<ArchitectureTable, Record<string, unknown>[]>>;

const HEARTBEAT_ONLINE_MS = 3 * 60_000;
const HEARTBEAT_STALE_MS = 24 * 60 * 60_000;

export const text = (value: unknown): string => typeof value === 'string' ? value.trim() : '';
export const record = (value: unknown): Record<string, unknown> =>
  value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
export const strings = (value: unknown): string[] =>
  Array.isArray(value) ? value.filter((x): x is string => typeof x === 'string' && x.trim().length > 0) : [];
export const unique = (values: string[]) => [...new Set(values.filter(Boolean))].sort();
export const architectureSlug = (value: string) =>
  value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

/** URL's zonder wachtwoorden, queries of hashes; nooit config-objecten doorgeven aan de UI. */
export function architectureSafeUrl(value: unknown): string {
  try {
    const url = new URL(text(value));
    if (!['https:', 'http:'].includes(url.protocol)) return '';
    return `${url.protocol}//${url.host}${url.pathname}`;
  } catch {
    return '';
  }
}

export function emptyArchitectureManifest(): ArchitectureManifest {
  return { schemaVersion: 1, sources: [], nodes: [], edges: [], warnings: [] };
}

export function heartbeatLiveStatus(at: unknown, now = Date.now()): string {
  const parsed = Date.parse(text(at));
  if (!Number.isFinite(parsed)) return 'unknown';
  const age = now - parsed;
  if (age < HEARTBEAT_ONLINE_MS) return 'online';
  if (age < HEARTBEAT_STALE_MS) return 'stale';
  return 'offline';
}

/** Alleen benoemde beschrijvende velden. Prompts, payloads, env en credentials blijven erbuiten. */
export function detailsOf(row: Record<string, unknown>, fields: string[]): ArchitectureDetails {
  const result: ArchitectureDetails = {};
  for (const key of fields) {
    const value = row[key];
    if (typeof value === 'string' || typeof value === 'boolean' || typeof value === 'number') result[key] = value;
  }
  return result;
}

export function sortArchitectureManifest(manifest: ArchitectureManifest): ArchitectureManifest {
  return {
    schemaVersion: 1,
    sources: [...manifest.sources].sort((a, b) => a.path.localeCompare(b.path)),
    nodes: [...manifest.nodes].sort((a, b) => a.id.localeCompare(b.id)),
    edges: [...manifest.edges]
      .filter(edge => manifest.nodes.some(n => n.id === edge.source) && manifest.nodes.some(n => n.id === edge.target))
      .sort((a, b) => a.id.localeCompare(b.id)),
    warnings: [...manifest.warnings],
  };
}

export type ArchitectureGraphBuilder = ReturnType<typeof createArchitectureGraph>;

export function createArchitectureGraph(base: ArchitectureManifest = emptyArchitectureManifest()) {
  const nodes = new Map(base.nodes.map(node => [node.id, { ...node, details: { ...node.details }, sources: [...node.sources] }]));
  const edges = new Map(base.edges.map(edge => [edge.id, { ...edge, sources: [...edge.sources] }]));
  const sources = new Map(base.sources.map(source => [source.path, source]));
  const warnings = [...base.warnings];

  const addSource = (path: string, kind: string) => {
    sources.set(path, { path, kind });
    return path;
  };

  const put = (node: ArchitectureNode) => {
    const old = nodes.get(node.id);
    nodes.set(node.id, {
      ...old,
      ...node,
      appId: node.appId ?? old?.appId,
      description: node.description || old?.description,
      details: { ...old?.details, ...node.details },
      sources: unique([...(old?.sources ?? []), ...node.sources]),
    });
  };

  const link = (source: string, target: string, relation: string, evidence: string, label?: string) => {
    if (!nodes.has(source) || !nodes.has(target) || source === target) return;
    const same = [...edges.values()].find(edge => edge.source === source && edge.target === target && edge.relation === relation);
    const id = same?.id ?? `${relation}:${source}:${target}`;
    edges.set(id, {
      id,
      source,
      target,
      relation,
      label: label ?? same?.label ?? relation,
      sources: unique([...(same?.sources ?? []), evidence]),
    });
  };

  const warn = (message: string) => {
    if (!warnings.includes(message)) warnings.push(message);
  };

  const manifest = (): ArchitectureManifest => sortArchitectureManifest({
    schemaVersion: 1,
    sources: [...sources.values()],
    nodes: [...nodes.values()],
    edges: [...edges.values()],
    warnings,
  });

  return { nodes, edges, sources, addSource, put, link, warn, manifest };
}

/** Voegt echte rijen samen op stabiele ids; naamgelijkenis is geen bewijs van eigenaarschap. */
export function mergeArchitectureLive(base: ArchitectureManifest, rows: ArchitectureRows, now = Date.now()): ArchitectureManifest {
  const graph = createArchitectureGraph(base);
  const sourceFor = (table: ArchitectureTable) => graph.addSource(`supabase:public.${table}`, 'live-register');

  const appRows = rows.registered_apps ?? [];
  const appByRegistryId = new Map<string, string>();
  for (const row of appRows) {
    const name = text(row.name);
    const productKey = text(row.product_key);
    if (!name && !productKey) continue;
    const existing = [...graph.nodes.values()].find(node => node.kind === 'app' && (
      (text(row.id) && node.details.registryId === row.id) || (productKey && node.id === `app:${productKey}`) || node.label === name
    ));
    const id = existing?.id ?? `app:${productKey || architectureSlug(name)}`;
    const source = sourceFor('registered_apps');
    const details = detailsOf(row, ['repo', 'default_branch', 'enabled', 'product_key', 'internal_path', 'deploy_target', 'android_package', 'owner_agent', 'workdir']);
    details.registryId = text(row.id);
    details.liveStatus = row.enabled === false ? 'disabled' : 'registered';
    const url = architectureSafeUrl(row.prod_url);
    if (url) details.url = url;
    const secretNames = strings(row.secret_names);
    if (secretNames.length) details.secretNames = secretNames;
    const cronKeys = strings(row.cron_job_keys);
    if (cronKeys.length) details.cronJobKeys = cronKeys;
    graph.put({ id, kind: 'app', label: name || productKey, description: text(row.description), details, sources: [source] });
    if (text(row.id)) appByRegistryId.set(text(row.id), id);
    const ref = text(row.supabase_ref);
    if (/^[a-z0-9-]+$/.test(ref)) {
      const projectId = `supabase:${ref}`;
      graph.put({ id: projectId, kind: 'supabase-project', label: `Supabase · ${ref}`, details: { projectRef: ref }, sources: [source] });
      graph.link(id, projectId, 'uses-project', source);
    }
    const owner = text(row.owner_agent);
    if (owner) graph.link(id, `agent:${owner}`, 'managed-by', source);
    for (const job of cronKeys) {
      const cronId = `cron:${job}`;
      graph.put({ id: cronId, kind: 'cron', label: job, appId: id, details: { jobKey: job, liveStatus: 'registered' }, sources: [source] });
      graph.link(id, cronId, 'registers-cron', source);
    }
    const surfaces = record(row.surfaces);
    for (const [surface, value] of Object.entries(surfaces)) {
      if (!['desktop', 'android', 'mcp'].includes(surface) || !text(value)) continue;
      const kind = surface === 'mcp' ? 'mcp' : 'runtime';
      const surfaceId = `${kind}:${id}:${surface}`;
      graph.put({
        id: surfaceId, kind, label: `${name || productKey} · ${surface}`, appId: id,
        details: { surface, ...(architectureSafeUrl(value) ? { url: architectureSafeUrl(value) } : {}) }, sources: [source],
      });
      graph.link(id, surfaceId, 'has-surface', source);
    }
    if (text(row.android_package)) {
      const runtimeId = `runtime:android:${text(row.android_package)}`;
      graph.put({
        id: runtimeId, kind: 'runtime', label: `${name || productKey} · Android`, appId: id,
        details: { package: text(row.android_package), platform: 'Android' }, sources: [source],
      });
      graph.link(id, runtimeId, 'has-surface', source);
    }
    if (text(row.deploy_target).startsWith('cf-pages-')) {
      const cfId = `cloudflare:${id}:pages`;
      graph.put({
        id: cfId, kind: 'cloudflare', label: `${name || productKey} · Cloudflare Pages`, appId: id,
        details: { deployTarget: text(row.deploy_target), liveStatus: 'registered' }, sources: [source],
      });
      graph.link(id, cfId, 'deploy-target', source);
    }
  }

  const knownApp = (row: Record<string, unknown>): string | undefined => {
    const metadata = record(row.metadata);
    const key = text(row.product_key) || text(metadata.product_key) || text(metadata.app);
    const candidate = appByRegistryId.get(text(row.app_id)) ?? (key ? `app:${key}` : undefined);
    return candidate && graph.nodes.get(candidate)?.kind === 'app' ? candidate : undefined;
  };

  for (const row of rows.core_agents ?? []) {
    const name = text(row.name);
    if (!name) continue;
    const source = sourceFor('core_agents');
    const id = `agent:${name}`;
    const appId = knownApp(row);
    graph.put({
      id, kind: 'agent', label: text(row.display_name) || name, ...(appId ? { appId } : {}),
      description: text(row.description),
      details: {
        ...detailsOf(row, ['role', 'model_provider', 'model_name', 'memory_namespace']),
        registryId: text(row.id),
        liveStatus: text(row.status) || 'unknown',
      },
      sources: [source],
    });
    if (appId) graph.link(appId, id, 'has-agent', source);
    const provider = text(row.model_provider);
    if (provider) graph.link(id, `provider:${provider}`, 'uses-provider', source);
  }

  for (const row of rows.core_mcp_servers ?? []) {
    const name = text(row.name);
    if (!name) continue;
    const source = sourceFor('core_mcp_servers');
    const id = `mcp:${name}`;
    const appId = knownApp(row);
    const url = architectureSafeUrl(row.url);
    graph.put({
      id, kind: 'mcp', label: text(row.display_name) || name, ...(appId ? { appId } : {}),
      description: text(row.description),
      details: { ...detailsOf(row, ['transport', 'last_ping_at']), ...(url ? { url } : {}), liveStatus: text(row.status) || 'unknown' },
      sources: [source],
    });
    if (appId) graph.link(appId, id, 'uses-mcp', source);
  }

  for (const row of rows.core_schedules ?? []) {
    if (!text(row.id) && !text(row.job_key) && !text(record(row.metadata).job_key)) continue;
    const source = sourceFor('core_schedules');
    const metadata = record(row.metadata);
    const jobKey = text(metadata.job_key) || text(row.job_key) || text(row.id);
    const id = `cron:${jobKey}`;
    const appId = knownApp(row);
    graph.put({
      id, kind: 'cron', label: text(row.name) || jobKey, ...(appId ? { appId } : {}),
      details: {
        ...detailsOf(row, ['cron_expr', 'timezone', 'enabled', 'action_type', 'last_run_at', 'next_run_at', 'last_status']),
        registryId: text(row.id),
        liveStatus: row.enabled === false ? 'disabled' : text(row.last_status) || 'scheduled',
      },
      sources: [source],
    });
    if (appId) graph.link(appId, id, 'registers-cron', source);
    const payload = record(row.action_payload);
    const agent = text(payload.agent_id) || text(payload.agent);
    if (agent) graph.link(id, `agent:${agent}`, 'invokes', source);
    for (const specialist of strings(payload.specialists)) graph.link(id, `specialist:${specialist}`, 'invokes', source);
  }

  for (const row of rows.core_computer_workers ?? []) {
    const device = text(row.device_id);
    if (!device) continue;
    const source = sourceFor('core_computer_workers');
    const id = `worker:${device}`;
    const host = text(row.host);
    graph.put({
      id, kind: 'worker', label: host || device,
      description: 'Computer worker heartbeat',
      details: {
        ...detailsOf(row, ['device_id', 'worker_id', 'host', 'heartbeat_at']),
        liveStatus: heartbeatLiveStatus(row.heartbeat_at, now),
      },
      sources: [source],
    });
    graph.link('app:axe_core', id, 'runs-worker', source);
    const runtimeId = host.toLowerCase().includes('imac') ? 'runtime:imac' : 'runtime:mac-mini';
    if (graph.nodes.has(runtimeId)) graph.link(id, runtimeId, 'runs-on', source);
  }

  for (const row of rows.core_dax_computers ?? []) {
    const name = text(row.id);
    if (!name) continue;
    const source = sourceFor('core_dax_computers');
    const id = `dax:${name}`;
    const owner = text(row.owner_agent);
    const appId = owner === 'northsea' ? 'app:northsea' : owner === 'trading' ? 'app:trading_os' : 'app:axe_core';
    graph.put({
      id, kind: 'dax', label: name, appId,
      description: text(row.container_name) || 'DAX computer',
      details: {
        ...detailsOf(row, ['owner_agent', 'container_name', 'status', 'runtime', 'heartbeat_at']),
        liveStatus: text(row.status) || heartbeatLiveStatus(row.heartbeat_at, now),
      },
      sources: [source],
    });
    graph.link(appId, id, 'has-dax', source);
    if (owner) graph.link(`agent:${owner}`, id, 'owns-dax', source);
  }

  return graph.manifest();
}
