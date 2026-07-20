import { getSupabase } from '@/infrastructure/supabase/supabaseClient';
import { PROVIDERS } from '@/domain/providers';
import { checkAllServices, getSystemState, type ServiceState } from '@/application/system/systemService';
import { getStoredLlmModelRegistry, type LlmModelRegistryEntry } from '@/infrastructure/persistence/llmModelRegistryService';
import { loadCapabilities, type CapabilityConfig } from '@/infrastructure/persistence/capabilityService';
import { loadMcpServers, type MCPServer } from '@/infrastructure/persistence/mcpRegistryService';
import { loadSetting } from '@/infrastructure/persistence/userSettingsService';
import { loadAgentOverrides } from '@/infrastructure/persistence/runtimeEditsService';

export type RegistryStatus = 'online' | 'healthy' | 'configured' | 'degraded' | 'offline' | 'unknown';

export interface RegistryItem {
  id: string;
  label: string;
  status: RegistryStatus;
  detail?: string;
  source: string;
  meta?: Record<string, unknown>;
}

export interface RegistrySection {
  id: string;
  title: string;
  description: string;
  items: RegistryItem[];
}

export interface SystemRegistrySnapshot {
  generatedAt: string;
  sections: RegistrySection[];
}

export type OrganizationNodeKind =
  | 'user'
  | 'core'
  | 'executive'
  | 'orchestrator'
  | 'specialist'
  | 'application'
  | 'provider'
  | 'model'
  | 'coding_system'
  | 'research_system'
  | 'tool'
  | 'mcp'
  | 'service'
  | 'memory'
  | 'infrastructure'
  | 'health';

export interface OrganizationNode {
  id: string;
  label: string;
  kind: OrganizationNodeKind;
  status: RegistryStatus;
  detail?: string;
  source: string;
  parentId?: string;
  children: OrganizationNode[];
  meta?: Record<string, unknown>;
}

export interface OrganizationSnapshot {
  generatedAt: string;
  root: OrganizationNode;
  registry: SystemRegistrySnapshot;
}

const SPECIALIST_AGENTS = [
  { id: 'wags', label: 'Wags', detail: 'Developer Specialist — code, builds, patches' },
  { id: 'dollar-bill', label: 'Dollar Bill', detail: 'Finance and Trading Specialist — markets, P&L, risk' },
  { id: 'intel', label: 'Intel', detail: 'Research Specialist — web research, intelligence' },
  { id: 'sentinel', label: 'Sentinel', detail: 'Automation Specialist — flows, triggers, integrations' },
  { id: 'forge', label: 'Forge', detail: 'Infrastructure and Build Specialist — CI/CD, Docker, deployments' },
  { id: 'pulse', label: 'Pulse', detail: 'System Monitoring Specialist — uptime, logs, health' },
  { id: 'atlas', label: 'Atlas', detail: 'Memory and Knowledge Specialist — context, vector search' },
  { id: 'nova', label: 'Nova', detail: 'Product Strategy Specialist — positioning, growth, competitors' },
];

function statusFromService(s: ServiceState['status']): RegistryStatus {
  if (s === 'online') return 'online';
  if (s === 'degraded') return 'degraded';
  if (s === 'offline') return 'offline';
  return 'unknown';
}

function statusFromBool(value?: boolean): RegistryStatus {
  if (value === true) return 'healthy';
  if (value === false) return 'offline';
  return 'unknown';
}

async function loadAgents(): Promise<RegistryItem[]> {
  const sb = getSupabase();
  if (!sb) return [];
  try {
    const { data } = await sb.from('core_agents').select('id, name, role, app_name, status, updated_at').order('name');
    return (data ?? []).map((row: Record<string, unknown>) => ({
      id: String(row.id ?? row.name ?? crypto.randomUUID()),
      label: String(row.name ?? row.role ?? 'agent'),
      status: statusFromBool(String(row.status ?? '') === 'active'),
      detail: [row.role, row.app_name].filter(Boolean).join(' · '),
      source: 'core_agents',
      meta: { updated_at: row.updated_at ?? null },
    }));
  } catch {
    return [];
  }
}

async function loadAgentPromptIndex(): Promise<Record<string, Record<string, unknown>>> {
  const sb = getSupabase();
  if (!sb) return {};
  try {
    const { data } = await sb.from('core_agents').select('id, name, role, app_name, status, system_prompt, memory_scope, skills, permissions, preferred_models, fallback_models, metadata, updated_at');
    const index: Record<string, Record<string, unknown>> = {};
    for (const row of data ?? []) {
      const r = row as Record<string, unknown>;
      const keys = [
        String(r.name ?? '').toLowerCase(),
        String(r.role ?? '').toLowerCase(),
        String(r.id ?? '').toLowerCase(),
      ].filter(Boolean);
      for (const key of keys) index[key] = r;
    }
    return index;
  } catch {
    return {};
  }
}

async function loadWorkflows(): Promise<RegistryItem[]> {
  const sb = getSupabase();
  if (!sb) return [];
  try {
    const [core, registry] = await Promise.all([
      sb.from('core_workflows').select('id, name, platform, status, updated_at').order('name'),
      sb.from('automation_registry').select('id, display_name, app_name, status, updated_at').order('display_name'),
    ]);
    const items: RegistryItem[] = [];
    for (const row of core.data ?? []) {
      const r = row as Record<string, unknown>;
      items.push({
        id: String(r.id ?? r.name ?? crypto.randomUUID()),
        label: String(r.name ?? 'workflow'),
        status: String(r.status ?? '') === 'active' ? 'online' : String(r.status ?? '') === 'paused' ? 'degraded' : 'unknown',
        detail: String(r.platform ?? 'workflow'),
        source: 'core_workflows',
        meta: { updated_at: r.updated_at ?? null },
      });
    }
    for (const row of registry.data ?? []) {
      const r = row as Record<string, unknown>;
      items.push({
        id: String(r.id ?? r.display_name ?? crypto.randomUUID()),
        label: String(r.display_name ?? 'automation'),
        status: String(r.status ?? '') === 'active' ? 'online' : String(r.status ?? '') === 'paused' ? 'degraded' : 'unknown',
        detail: String(r.app_name ?? 'automation'),
        source: 'automation_registry',
        meta: { updated_at: r.updated_at ?? null },
      });
    }
    return items;
  } catch {
    return [];
  }
}

/** EVE ("Executive Intelligence") lives one tier above the specialist roster —
 *  its skill/provider data is currently only tracked client-side (EveFramework.tsx),
 *  so we read that snapshot directly rather than inventing a duplicate registry. */
function loadEveSnapshot(): { skillCount: number; providerCount: number; activeProviderCount: number } {
  try {
    const raw = typeof localStorage !== 'undefined' ? localStorage.getItem('axe_eve_providers') : null;
    if (!raw) return { skillCount: 0, providerCount: 0, activeProviderCount: 0 };
    const providers = JSON.parse(raw) as Array<{ connected?: boolean; skills?: Array<{ active?: boolean }> }>;
    const skillCount = providers.reduce((sum, p) => sum + (p.skills?.filter(s => s.active).length ?? 0), 0);
    const activeProviderCount = providers.filter(p => p.connected).length;
    return { skillCount, providerCount: providers.length, activeProviderCount };
  } catch {
    return { skillCount: 0, providerCount: 0, activeProviderCount: 0 };
  }
}

export async function loadSystemRegistry(): Promise<SystemRegistrySnapshot> {
  const sb = getSupabase();
  await checkAllServices().catch(() => {});
  const memoryCountPromise = sb
    ? (async () => {
        try {
          const { count } = await sb.from('core_memory').select('id', { count: 'exact', head: true });
          return count ?? 0;
        } catch {
          return 0;
        }
      })()
    : Promise.resolve(0);

  const [services, capabilities, mcpServers, agents, workflows, models, modelHealth, memoryCount] = await Promise.all([
    getSystemState(),
    loadCapabilities(),
    loadMcpServers(),
    loadAgents(),
    loadWorkflows(),
    loadSetting<LlmModelRegistryEntry[]>('axe_ollama_model_registry', getStoredLlmModelRegistry()),
    loadSetting<Record<string, { status?: string; lastTestAt?: string; lastError?: string; baseUrl?: string }>>('axe_ollama_model_health', {}),
    memoryCountPromise,
  ]);

  const llmConnections = await loadSetting<Record<string, { key?: string; model?: string; lastTest?: string; lastTestAt?: string; baseUrl?: string }>>('axe_llm_connections', {});

  const providerItems: RegistryItem[] = PROVIDERS.map(provider => {
    const conn = llmConnections[provider.id];
    return {
      id: provider.id,
      label: provider.name,
      status: conn?.lastTest === 'ok' ? 'healthy' : conn?.lastTest === 'fail' ? 'offline' : conn?.baseUrl || conn?.key ? 'configured' : 'unknown',
      detail: [provider.defaultModel, provider.baseUrl].filter(Boolean).join(' · '),
      source: 'providers',
      meta: {
        model: conn?.model ?? provider.defaultModel,
        baseUrl: conn?.baseUrl ?? provider.baseUrl,
        lastTestAt: conn?.lastTestAt ?? null,
      },
    };
  });

  const modelItems: RegistryItem[] = models.map((model: LlmModelRegistryEntry) => {
    const state = modelHealth[model.name];
    return {
      id: model.name,
      label: model.displayName,
      status: state?.status === 'ok' ? 'healthy' : state?.status === 'fail' ? 'offline' : 'configured',
      detail: model.description,
      source: 'ollama_models',
      meta: { provider: model.provider, baseUrl: state?.baseUrl ?? null, lastTestAt: state?.lastTestAt ?? null, category: model.category },
    };
  });

  const sections: RegistrySection[] = [
    {
      id: 'identity',
      title: 'Identity',
      description: 'Single OS identity and app lanes.',
      items: [
        { id: 'axe-core', label: 'AXE CORE', status: 'online', detail: 'Orchestrator / OS brain', source: 'identity' },
        { id: 'axe-companion', label: 'AXE Companion', status: 'configured', detail: 'Personal assistant app', source: 'identity' },
        { id: 'axe-intel', label: 'AXE Intel', status: 'configured', detail: 'Market intelligence app', source: 'identity' },
        { id: 'trading-os', label: 'Trading OS', status: 'configured', detail: 'Execution lane', source: 'identity' },
      ],
    },
    {
      id: 'providers',
      title: 'Providers',
      description: 'API providers and local backends.',
      items: providerItems,
    },
    {
      id: 'models',
      title: 'Models',
      description: 'Visible model registry with saved health.',
      items: modelItems,
    },
    {
      id: 'services',
      title: 'Services',
      description: 'Live health checks from the infrastructure layer.',
      items: services.map((service: ServiceState) => ({
        id: service.service,
        label: service.display,
        status: statusFromService(service.status),
        detail: service.latency_ms != null ? `${service.latency_ms}ms` : service.version ?? undefined,
        source: 'core_system_state',
        meta: { last_seen: service.last_seen ?? null },
      })),
    },
    {
      id: 'mcp',
      title: 'MCP',
      description: 'Tool servers and integrations.',
      items: mcpServers.map((server: MCPServer) => ({
        id: server.id,
        label: server.name,
        status: server.status === 'online' ? 'online' : server.status === 'standby' ? 'configured' : 'offline',
        detail: server.version ? `${server.version}` : server.docsUrl,
        source: 'core_mcp_servers',
      })),
    },
    {
      id: 'capabilities',
      title: 'Capabilities',
      description: 'Orchestration rules and routing policy.',
      items: capabilities.map((cap: CapabilityConfig) => ({
        id: cap.capability,
        label: cap.display_name,
        status: cap.enabled ? 'configured' : 'offline',
        detail: `${cap.preferred_provider} → ${cap.preferred_model}`,
        source: 'core_capabilities',
        meta: { execution_mode: cap.execution_mode ?? 'read' },
      })),
    },
    {
      id: 'agents',
      title: 'Agents',
      description: 'Live agent records from core_agents.',
      items: agents,
    },
    {
      id: 'workflows',
      title: 'Workflows',
      description: 'n8n and automation registries.',
      items: workflows,
    },
    {
      id: 'memory',
      title: 'Memory',
      description: 'Core memory records visible to AXE Core.',
      items: [
        {
          id: 'core_memory',
          label: 'core_memory',
          status: memoryCount > 0 ? 'online' : 'unknown',
          detail: `${memoryCount} records`,
          source: 'core_memory',
        },
      ],
    },
  ];

  return { generatedAt: new Date().toISOString(), sections };
}

function findSection(registry: SystemRegistrySnapshot, id: string): RegistrySection {
  return registry.sections.find(section => section.id === id) ?? { id, title: id, description: '', items: [] };
}

function toChildNode(item: RegistryItem, kind: OrganizationNodeKind, parentId: string): OrganizationNode {
  return {
    id: `${parentId}:${item.id}`,
    label: item.label,
    kind,
    status: item.status,
    detail: item.detail,
    source: item.source,
    parentId,
    children: [],
    meta: item.meta,
  };
}

function promptState(row?: Record<string, unknown>): RegistryStatus {
  if (typeof row?.system_prompt === 'string' && row.system_prompt.trim().length > 0) return 'configured';
  return 'unknown';
}

/** Curated "not yet registered" placeholder, reused wherever a spec category
 *  has no live data source yet — keeps the workspace honest instead of faking data. */
function placeholderItem(id: string, label: string, detail: string): RegistryItem {
  return { id, label, status: 'unknown', detail, source: 'organization' };
}

function pickKnown(pool: RegistryItem[], spec: Array<{ id: string; label: string; detail: string }>): RegistryItem[] {
  return spec.map(s => {
    const found = pool.find(item => item.id === s.id);
    return found ?? placeholderItem(s.id, s.label, `${s.detail} — not yet registered`);
  });
}

const CODING_SYSTEMS_SPEC = [
  { id: 'kilocode', label: 'Kilo Code', detail: 'IDE bridge, live code editing' },
  { id: 'github', label: 'GitHub', detail: 'Source control' },
  { id: 'docker', label: 'Docker', detail: 'Container runtime' },
];

const RESEARCH_SYSTEMS_SPEC = [
  { id: 'crewai', label: 'CrewAI', detail: 'Multi-agent research crews' },
  { id: 'hermes', label: 'Hermes Agent', detail: 'Research agent bridge' },
  { id: 'openhands', label: 'OpenHands', detail: 'Deep research & browsing agent' },
];

export async function loadAxeOrganization(): Promise<OrganizationSnapshot> {
  const [registry, promptIndex, overrides] = await Promise.all([
    loadSystemRegistry(),
    loadAgentPromptIndex(),
    loadAgentOverrides(),
  ]);

  const providers = findSection(registry, 'providers').items;
  const models = findSection(registry, 'models').items;
  const services = findSection(registry, 'services').items;
  const mcp = findSection(registry, 'mcp').items;
  const capabilities = findSection(registry, 'capabilities').items;
  const memory = findSection(registry, 'memory').items;
  const workflows = findSection(registry, 'workflows').items;
  const identity = findSection(registry, 'identity').items;

  const axeCorePrompt = promptIndex['axe core'] ?? promptIndex['axe_core'] ?? promptIndex['axe-core'];
  const orchestratorPrompt = promptIndex.orchestrator ?? promptIndex['axe orchestrator'] ?? promptIndex['axe_core_orchestrator'];

  /** Merge a live Supabase row with any locally-mirrored edit (edits made in the
   *  Runtime inspector always win — they are the freshest source of truth). */
  function withOverride(agentSaveKey: string, row?: Record<string, unknown>) {
    const override = overrides[agentSaveKey.toLowerCase()];
    return {
      prompt: override?.systemPrompt ?? (typeof row?.system_prompt === 'string' ? row.system_prompt : null),
      skills: override?.skills ?? (Array.isArray(row?.skills) ? row.skills as string[] : []),
    };
  }

  // ── Providers → Models (nested, not a flat sibling list) ────────────────
  const modelNodes = models.map(model => toChildNode(model, 'model', 'models'));
  const providerNodes = providers.map(provider => ({
    ...toChildNode(provider, 'provider', 'providers'),
    children: modelNodes.filter(model => String(model.meta?.provider ?? '').toLowerCase() === provider.id.toLowerCase()),
  }));
  const unassignedModels = modelNodes.filter(model => !providers.some(p => String(model.meta?.provider ?? '').toLowerCase() === p.id.toLowerCase()));

  const ensureItem = (items: RegistryItem[], item: RegistryItem) => (
    items.some(existing => existing.id === item.id) ? items : [...items, item]
  );

  const codingSystems = pickKnown([...services, ...mcp], CODING_SYSTEMS_SPEC);
  const researchSystems = pickKnown([...services, ...mcp], RESEARCH_SYSTEMS_SPEC);
  const claimedIds = new Set([...codingSystems, ...researchSystems].map(i => i.id));

  let tools: RegistryItem[] = [
    ...services.filter(item => ['supabase', 'n8n', 'openclaw'].includes(item.id) && !claimedIds.has(item.id)),
    ...mcp.filter(item => ['supabase', 'cloudflare', 'railway', 'metaapi'].includes(item.id) && !claimedIds.has(item.id)),
  ];
  tools = ensureItem(tools, placeholderItem('n8n', 'n8n', 'Workflow automation'));

  const infraExcludedIds = new Set([...claimedIds, ...tools.map(t => t.id)]);
  let infrastructure = services.filter(item => !infraExcludedIds.has(item.id));
  infrastructure = ensureItem(infrastructure, placeholderItem('vps', 'VPS', 'Hetzner host registry pending'));

  // MCP Servers gets its own top-level branch, distinct from generic Tools.
  const mcpServers = mcp.filter(item => !claimedIds.has(item.id) && !tools.some(t => t.id === item.id));

  // Applications: everything AXE identifies as a product surface, minus AXE CORE itself.
  const applications = identity.filter(item => item.id !== 'axe-core');

  const specialistNodes = SPECIALIST_AGENTS.map(agent => {
    const row = promptIndex[agent.id] ?? promptIndex[agent.label.toLowerCase()];
    const saveKey = (row?.name as string | undefined) ?? agent.label;
    const merged = withOverride(saveKey, row);
    return {
      id: `specialist:${agent.id}`,
      label: agent.label,
      kind: 'specialist' as const,
      status: merged.prompt ? 'configured' as const : row ? promptState(row) : 'unknown' as const,
      detail: agent.detail,
      source: row ? 'core_agents' : 'specialist_defaults',
      parentId: 'orchestrator',
      children: [],
      meta: {
        prompt: merged.prompt,
        memory: row?.memory_scope ?? null,
        skills: merged.skills,
        permissions: row?.permissions ?? [],
        preferredModels: row?.preferred_models ?? [],
        fallbackModels: row?.fallback_models ?? [],
        learningState: (row?.metadata as Record<string, unknown> | undefined)?.learning_state ?? 'not_registered',
        activity: row?.updated_at ?? null,
        agentSaveKey: saveKey,
      },
    };
  });

  const orchestratorSaveKey = (orchestratorPrompt?.name as string | undefined) ?? 'Orchestrator';
  const orchestratorMerged = withOverride(orchestratorSaveKey, orchestratorPrompt);

  const orchestrator: OrganizationNode = {
    id: 'orchestrator',
    label: 'Orchestrator',
    kind: 'orchestrator',
    status: orchestratorMerged.prompt ? 'configured' : promptState(orchestratorPrompt),
    detail: 'Decision engine, routing, workflows, approvals',
    source: orchestratorPrompt ? 'core_agents' : 'organization',
    parentId: 'axe-core',
    children: [
      ...specialistNodes,
      {
        id: 'capability-registry',
        label: 'Capability Registry',
        kind: 'tool',
        status: capabilities.length ? 'configured' : 'unknown',
        detail: `${capabilities.length} capabilities`,
        source: 'core_capabilities',
        parentId: 'orchestrator',
        children: capabilities.map(item => toChildNode(item, 'tool', 'capability-registry')),
      },
      {
        id: 'decision-registry',
        label: 'Decision Registry',
        kind: 'tool',
        status: workflows.length ? 'configured' : 'unknown',
        detail: `${workflows.length} workflows`,
        source: 'core_workflows',
        parentId: 'orchestrator',
        children: workflows.map(item => toChildNode(item, 'tool', 'decision-registry')),
      },
    ],
    meta: {
      prompt: orchestratorMerged.prompt,
      skills: orchestratorMerged.skills,
      memory: orchestratorPrompt?.memory_scope ?? null,
      preferredWorkflow: (orchestratorPrompt?.metadata as Record<string, unknown> | undefined)?.preferred_workflow ?? 'adaptive',
      agentSaveKey: orchestratorSaveKey,
    },
  };

  // ── EVE — Executive Intelligence, a tier of its own between AXE CORE and the Orchestrator ──
  const eveSnapshot = loadEveSnapshot();
  const executive: OrganizationNode = {
    id: 'eve',
    label: 'EVE',
    kind: 'executive',
    status: eveSnapshot.activeProviderCount > 0 ? 'online' : eveSnapshot.providerCount > 0 ? 'configured' : 'unknown',
    detail: 'Executive Intelligence — cross-provider skill governance',
    source: eveSnapshot.providerCount ? 'axe_eve_providers' : 'organization',
    parentId: 'axe-core',
    children: [],
    meta: {
      skillCount: eveSnapshot.skillCount,
      providerCount: eveSnapshot.providerCount,
      activeProviderCount: eveSnapshot.activeProviderCount,
      tier: 'executive',
    },
  };

  const axeCoreSaveKey = (axeCorePrompt?.name as string | undefined) ?? 'AXE CORE';
  const axeCoreMerged = withOverride(axeCoreSaveKey, axeCorePrompt);

  const axeCoreChildren: OrganizationNode[] = [
    executive,
    orchestrator,
    {
      id: 'applications',
      label: 'Applications',
      kind: 'application',
      status: applications.length ? 'configured' : 'unknown',
      detail: `${applications.length} product surfaces`,
      source: 'identity',
      parentId: 'axe-core',
      children: applications.map(item => toChildNode(item, 'application', 'applications')),
    },
    {
      id: 'providers',
      label: 'Providers',
      kind: 'provider',
      status: providers.length ? 'configured' : 'unknown',
      detail: `${providers.length} providers`,
      source: 'providers',
      parentId: 'axe-core',
      children: unassignedModels.length
        ? [...providerNodes, { ...placeholderNode('unassigned-models', 'Unassigned Models', 'model', 'providers'), children: unassignedModels }]
        : providerNodes,
    },
    {
      id: 'coding-systems',
      label: 'Coding Systems',
      kind: 'coding_system',
      status: codingSystems.some(i => i.status !== 'unknown') ? 'configured' : 'unknown',
      detail: `${codingSystems.length} systems`,
      source: 'organization',
      parentId: 'axe-core',
      children: codingSystems.map(item => toChildNode(item, 'coding_system', 'coding-systems')),
    },
    {
      id: 'research-systems',
      label: 'Research Systems',
      kind: 'research_system',
      status: researchSystems.some(i => i.status !== 'unknown') ? 'configured' : 'unknown',
      detail: `${researchSystems.length} systems`,
      source: 'organization',
      parentId: 'axe-core',
      children: researchSystems.map(item => toChildNode(item, 'research_system', 'research-systems')),
    },
    {
      id: 'tools',
      label: 'Tools',
      kind: 'tool',
      status: tools.length ? 'configured' : 'unknown',
      detail: `${tools.length} tools`,
      source: 'tools',
      parentId: 'axe-core',
      children: tools.map(item => toChildNode(item, 'tool', 'tools')),
    },
    {
      id: 'mcp-servers',
      label: 'MCP Servers',
      kind: 'mcp',
      status: mcpServers.length ? 'configured' : 'unknown',
      detail: `${mcpServers.length} servers`,
      source: 'core_mcp_servers',
      parentId: 'axe-core',
      children: mcpServers.map(item => toChildNode(item, 'mcp', 'mcp-servers')),
    },
    {
      id: 'services',
      label: 'Services',
      kind: 'service',
      status: infrastructure.length ? 'configured' : 'unknown',
      detail: `${infrastructure.length} services`,
      source: 'core_system_state',
      parentId: 'axe-core',
      children: infrastructure.map(item => toChildNode(item, 'service', 'services')),
    },
    {
      id: 'memory',
      label: 'Memory',
      kind: 'memory',
      status: memory.length ? memory[0].status : 'unknown',
      detail: memory[0]?.detail ?? 'No memory registry',
      source: 'core_memory',
      parentId: 'axe-core',
      children: memory.map(item => toChildNode(item, 'memory', 'memory')),
    },
    {
      id: 'infrastructure',
      label: 'Infrastructure',
      kind: 'infrastructure',
      status: infrastructure.length ? 'configured' : 'unknown',
      detail: `${infrastructure.length} nodes`,
      source: 'core_system_state',
      parentId: 'axe-core',
      children: infrastructure.map(item => toChildNode(item, 'infrastructure', 'infrastructure')),
    },
  ];

  const axeCore: OrganizationNode = {
    id: 'axe-core',
    label: 'AXE CORE',
    kind: 'core',
    status: axeCoreMerged.prompt ? 'configured' : promptState(axeCorePrompt),
    detail: 'Single AI OS identity',
    source: axeCorePrompt ? 'core_agents' : 'organization',
    parentId: 'you',
    children: axeCoreChildren,
    meta: {
      prompt: axeCoreMerged.prompt,
      skills: axeCoreMerged.skills,
      capabilities: capabilities.length,
      version: (axeCorePrompt?.metadata as Record<string, unknown> | undefined)?.version ?? 'registry',
      learningStatus: (axeCorePrompt?.metadata as Record<string, unknown> | undefined)?.learning_state ?? 'not_registered',
      agentSaveKey: axeCoreSaveKey,
    },
  };

  // ── Health — a live rollup, not documentation. Computed last from the assembled tree. ──
  const allNodes = flattenOrganization(axeCore);
  const healthyStatuses: RegistryStatus[] = ['healthy', 'online', 'configured'];
  const healthyCount = allNodes.filter(n => healthyStatuses.includes(n.status)).length;
  const totalCount = allNodes.length;
  const percentage = totalCount ? Math.round((healthyCount / totalCount) * 100) : 0;
  const health: OrganizationNode = {
    id: 'health',
    label: 'Health',
    kind: 'health',
    status: percentage >= 80 ? 'healthy' : percentage >= 50 ? 'degraded' : 'offline',
    detail: `${percentage}% operational`,
    source: 'organization',
    parentId: 'axe-core',
    children: [],
    meta: { healthyCount, totalCount, percentage },
  };
  axeCore.children.push(health);

  const root: OrganizationNode = {
    id: 'you',
    label: 'YOU',
    kind: 'user',
    status: 'online',
    detail: 'Owner and approval authority',
    source: 'identity',
    children: [axeCore],
  };

  return { generatedAt: registry.generatedAt, root, registry };
}

function placeholderNode(id: string, label: string, kind: OrganizationNodeKind, parentId: string): OrganizationNode {
  return { id, label, kind, status: 'unknown', detail: 'Not attributed to a known provider', source: 'organization', parentId, children: [] };
}

export function flattenOrganization(node: OrganizationNode): OrganizationNode[] {
  return [node, ...node.children.flatMap(flattenOrganization)];
}
