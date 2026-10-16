/** Brondefinities en live registergegevens blijven te onderscheiden; geen runtime-health afleiden. */
export type ArchitectureKind = 'app' | 'agent' | 'crew' | 'service' | 'supabase-project' | 'table' | 'cloudflare' | 'mcp' | 'runtime' | 'cron';
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
export const ARCHITECTURE_TABLES = ['registered_apps', 'core_agents', 'core_mcp_servers', 'core_schedules'] as const;
export type ArchitectureTable = typeof ARCHITECTURE_TABLES[number];
export type ArchitectureRows = Partial<Record<ArchitectureTable, Record<string, unknown>[]>>;

const text = (value: unknown): string => typeof value === 'string' ? value.trim() : '';
const record = (value: unknown): Record<string, unknown> => value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
const strings = (value: unknown): string[] => Array.isArray(value) ? value.filter((x): x is string => typeof x === 'string') : [];
const unique = (values: string[]) => [...new Set(values)].sort();
export const architectureSlug = (value: string) => value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

/** URL's zonder wachtwoorden, queries of hashes; nooit config-objecten doorgeven aan de UI. */
export function architectureSafeUrl(value: unknown): string {
  try {
    const url = new URL(text(value));
    if (!['https:', 'http:'].includes(url.protocol)) return '';
    return `${url.protocol}//${url.host}${url.pathname}`;
  } catch { return ''; }
}

/** Alleen benoemde beschrijvende velden. Prompts, payloads, env en credentials blijven erbuiten. */
function detailsOf(row: Record<string, unknown>, fields: string[]): ArchitectureDetails {
  const result: ArchitectureDetails = {};
  for (const key of fields) {
    const value = row[key];
    if (typeof value === 'string' || typeof value === 'boolean' || typeof value === 'number') result[key] = value;
  }
  return result;
}

/** Voegt echte rijen samen op stabiele ids; naamgelijkenis is geen bewijs van eigenaarschap. */
export function mergeArchitectureLive(base: ArchitectureManifest, rows: ArchitectureRows): ArchitectureManifest {
  const nodes = new Map(base.nodes.map(node => [node.id, { ...node, details: { ...node.details }, sources: [...node.sources] }]));
  const edges = new Map(base.edges.map(edge => [edge.id, { ...edge, sources: [...edge.sources] }]));
  const sources = new Map(base.sources.map(source => [source.path, source]));
  const sourceFor = (table: ArchitectureTable) => {
    const source = `supabase:public.${table}`;
    sources.set(source, { path: source, kind: 'live-register' });
    return source;
  };
  const put = (node: ArchitectureNode) => {
    const old = nodes.get(node.id);
    nodes.set(node.id, { ...old, ...node, details: { ...old?.details, ...node.details }, sources: unique([...(old?.sources ?? []), ...node.sources]) });
  };
  const link = (source: string, target: string, relation: string, evidence: string) => {
    if (!nodes.has(source) || !nodes.has(target) || source === target) return;
    const same = [...edges.values()].find(edge => edge.source === source && edge.target === target && edge.relation === relation);
    const id = same?.id ?? `live:${source}:${relation}:${target}`;
    edges.set(id, { id, source, target, relation, sources: unique([...(same?.sources ?? []), evidence]) });
  };
  const appRows = rows.registered_apps ?? [];
  const appByRegistryId = new Map<string, string>();
  for (const row of appRows) {
    const name = text(row.name);
    const productKey = text(row.product_key);
    if (!name && !productKey) continue;
    const existing = [...nodes.values()].find(node => node.kind === 'app' && (
      (text(row.id) && node.details.registryId === row.id) || (productKey && node.id === `app:${productKey}`) || node.label === name
    ));
    const id = existing?.id ?? `app:${productKey || architectureSlug(name)}`;
    const source = sourceFor('registered_apps');
    const details = detailsOf(row, ['repo', 'default_branch', 'enabled', 'product_key', 'internal_path', 'deploy_target', 'android_package']);
    details.registryId = text(row.id);
    details.liveStatus = row.enabled === false ? 'disabled' : 'registered';
    const url = architectureSafeUrl(row.prod_url);
    if (url) details.url = url;
    put({ id, kind: 'app', label: name || productKey, description: text(row.description), details, sources: [source] });
    if (text(row.id)) appByRegistryId.set(text(row.id), id);
    const ref = text(row.supabase_ref);
    if (/^[a-z0-9-]+$/.test(ref)) {
      const projectId = `supabase:${ref}`;
      put({ id: projectId, kind: 'supabase-project', label: `Supabase · ${ref}`, details: { projectRef: ref }, sources: [source] });
      link(id, projectId, 'uses-project', source);
    }
    const owner = text(row.owner_agent);
    if (owner) link(id, `agent:${owner}`, 'managed-by', source);
    for (const job of strings(row.cron_job_keys)) {
      const cronId = `cron:${job}`;
      put({ id: cronId, kind: 'cron', label: job, appId: id, details: { jobKey: job, liveStatus: 'registered' }, sources: [source] });
      link(id, cronId, 'registers-cron', source);
    }
    const surfaces = record(row.surfaces);
    // Alleen gestructureerde oppervlaknamen worden geclassificeerd; vrije tekst is geen deploybewijs.
    for (const [surface, value] of Object.entries(surfaces)) {
      if (!['desktop', 'android', 'mcp'].includes(surface) || !text(value)) continue;
      const kind = surface === 'mcp' ? 'mcp' : 'runtime';
      const surfaceId = `${kind}:${id}:${surface}`;
      put({ id: surfaceId, kind, label: `${name || productKey} · ${surface}`, appId: id,
        details: { surface, ...(architectureSafeUrl(value) ? { url: architectureSafeUrl(value) } : {}) }, sources: [source] });
      link(id, surfaceId, 'has-surface', source);
    }
    if (text(row.android_package)) {
      const runtimeId = `runtime:android:${text(row.android_package)}`;
      put({ id: runtimeId, kind: 'runtime', label: `${name || productKey} · Android`, appId: id,
        details: { package: text(row.android_package), platform: 'Android' }, sources: [source] });
      link(id, runtimeId, 'has-surface', source);
    }
    if (text(row.deploy_target).startsWith('cf-pages-')) {
      const cfId = `cloudflare:${id}:pages`;
      put({ id: cfId, kind: 'cloudflare', label: `${name || productKey} · Cloudflare Pages`, appId: id,
        details: { deployTarget: text(row.deploy_target), liveStatus: 'registered' }, sources: [source] });
      link(id, cfId, 'deploy-target', source);
    }
  }
  const knownApp = (row: Record<string, unknown>): string | undefined => {
    const metadata = record(row.metadata);
    const key = text(row.product_key) || text(metadata.product_key) || text(metadata.app);
    const candidate = appByRegistryId.get(text(row.app_id)) ?? (key ? `app:${key}` : undefined);
    return candidate && nodes.get(candidate)?.kind === 'app' ? candidate : undefined;
  };
  for (const row of rows.core_agents ?? []) {
    const name = text(row.name);
    if (!name) continue;
    const source = sourceFor('core_agents');
    const id = `agent:${name}`;
    const appId = knownApp(row);
    put({ id, kind: 'agent', label: text(row.display_name) || name, ...(appId ? { appId } : {}), description: text(row.description),
      details: { ...detailsOf(row, ['role', 'model_provider', 'model_name', 'memory_namespace']), registryId: text(row.id), liveStatus: text(row.status) || 'unknown' }, sources: [source] });
    if (appId) link(appId, id, 'has-agent', source);
  }
  for (const row of rows.core_mcp_servers ?? []) {
    const name = text(row.name);
    if (!name) continue;
    const source = sourceFor('core_mcp_servers');
    const id = `mcp:${name}`;
    const appId = knownApp(row);
    const url = architectureSafeUrl(row.url);
    put({ id, kind: 'mcp', label: text(row.display_name) || name, ...(appId ? { appId } : {}), description: text(row.description),
      details: { ...detailsOf(row, ['transport', 'last_ping_at']), ...(url ? { url } : {}), liveStatus: text(row.status) || 'unknown' }, sources: [source] });
    if (appId) link(appId, id, 'uses-mcp', source);
  }
  for (const row of rows.core_schedules ?? []) {
    if (!text(row.id)) continue;
    const source = sourceFor('core_schedules');
    const metadata = record(row.metadata);
    const jobKey = text(metadata.job_key) || text(row.job_key);
    const id = `cron:${jobKey || text(row.id)}`;
    const appId = knownApp(row);
    put({ id, kind: 'cron', label: text(row.name) || jobKey || text(row.id), ...(appId ? { appId } : {}),
      details: { ...detailsOf(row, ['cron_expr', 'timezone', 'enabled', 'action_type', 'last_run_at', 'next_run_at', 'last_status']), registryId: text(row.id), liveStatus: row.enabled === false ? 'disabled' : 'scheduled' }, sources: [source] });
    if (appId) link(appId, id, 'registers-cron', source);
    const payload = record(row.action_payload);
    const agent = text(payload.agent_id) || text(payload.agent);
    if (agent) link(id, `agent:${agent}`, 'invokes', source);
    for (const specialist of strings(payload.specialists)) link(id, `specialist:${specialist}`, 'invokes', source);
  }
  return {
    schemaVersion: 1,
    sources: [...sources.values()].sort((a, b) => a.path.localeCompare(b.path)),
    nodes: [...nodes.values()].sort((a, b) => a.id.localeCompare(b.id)),
    edges: [...edges.values()].filter(edge => nodes.has(edge.source) && nodes.has(edge.target)).sort((a, b) => a.id.localeCompare(b.id)),
    warnings: [...base.warnings],
  };
}
