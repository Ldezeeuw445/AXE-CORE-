import { getSupabase } from '@/lib/supabaseClient';
import { PROVIDERS } from '@/store/voiceStore';
import { checkAllServices, getSystemState, type ServiceState } from '@/services/systemService';
import { getStoredLlmModelRegistry, type LlmModelRegistryEntry } from '@/services/llmModelRegistryService';
import { loadCapabilities, type CapabilityConfig } from '@/services/capabilityService';
import { loadMcpServers, type MCPServer } from '@/services/mcpRegistryService';
import { loadSetting } from '@/services/userSettingsService';

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
  | 'orchestrator'
  | 'specialist'
  | 'provider'
  | 'model'
  | 'tool'
  | 'infrastructure';

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
  { id: 'wags', label: 'Wags', detail: 'Conversation, personal context, user-facing tasks' },
  { id: 'dollar-bill', label: 'Dollar Bill', detail: 'Finance, budgets, business, markets' },
  { id: 'intel', label: 'Intel', detail: 'Research, intelligence, market analysis' },
  { id: 'sentinel', label: 'Sentinel', detail: 'Security, approvals, risk checks' },
  { id: 'forge', label: 'Forge', detail: 'Code, builds, patches, self-improvement' },
  { id: 'pulse', label: 'Pulse', detail: 'Health, events, monitoring, activity' },
  { id: 'atlas', label: 'Atlas', detail: 'Maps, location, infrastructure topology' },
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

export async function loadAxeOrganization(): Promise<OrganizationSnapshot> {
  const [registry, promptIndex] = await Promise.all([
    loadSystemRegistry(),
    loadAgentPromptIndex(),
  ]);

  const providers = findSection(registry, 'providers').items;
  const models = findSection(registry, 'models').items;
  const services = findSection(registry, 'services').items;
  const mcp = findSection(registry, 'mcp').items;
  const capabilities = findSection(registry, 'capabilities').items;
  const memory = findSection(registry, 'memory').items;
  const workflows = findSection(registry, 'workflows').items;

  const axeCorePrompt = promptIndex['axe core'] ?? promptIndex['axe_core'] ?? promptIndex['axe-core'];
  const orchestratorPrompt = promptIndex.orchestrator ?? promptIndex['axe orchestrator'] ?? promptIndex['axe_core_orchestrator'];

  const modelNodes = models.map(model => toChildNode(model, 'model', 'models'));
  const providerNodes = providers.map(provider => ({
    ...toChildNode(provider, 'provider', 'providers'),
    children: modelNodes.filter(model => String(model.meta?.provider ?? '').toLowerCase() === provider.id.toLowerCase()),
  }));

  const ensureItem = (items: RegistryItem[], item: RegistryItem) => (
    items.some(existing => existing.id === item.id) ? items : [...items, item]
  );

  let tools: RegistryItem[] = [
    ...services.filter(item => ['github', 'supabase', 'n8n', 'openhands', 'crewai', 'kilocode', 'openclaw', 'hermes', 'docker'].includes(item.id)),
    ...mcp.filter(item => ['github', 'supabase', 'cloudflare', 'railway', 'metaapi'].includes(item.id)),
  ];
  tools = ensureItem(tools, { id: 'docker', label: 'Docker', status: 'unknown', detail: 'Host runtime not checked yet', source: 'organization' });

  let infrastructure = services.filter(item => !tools.some(tool => tool.id === item.id));
  infrastructure = ensureItem(infrastructure, { id: 'vps', label: 'VPS', status: 'unknown', detail: 'Hetzner host registry pending', source: 'organization' });

  const specialistNodes = SPECIALIST_AGENTS.map(agent => {
    const row = promptIndex[agent.id] ?? promptIndex[agent.label.toLowerCase()];
    return {
      id: `specialist:${agent.id}`,
      label: agent.label,
      kind: 'specialist' as const,
      status: row ? promptState(row) : 'unknown',
      detail: agent.detail,
      source: row ? 'core_agents' : 'specialist_defaults',
      parentId: 'orchestrator',
      children: [],
      meta: {
        prompt: typeof row?.system_prompt === 'string' ? row.system_prompt : null,
        memory: row?.memory_scope ?? null,
        skills: row?.skills ?? [],
        permissions: row?.permissions ?? [],
        preferredModels: row?.preferred_models ?? [],
        fallbackModels: row?.fallback_models ?? [],
        learningState: (row?.metadata as Record<string, unknown> | undefined)?.learning_state ?? 'not_registered',
        activity: row?.updated_at ?? null,
      },
    };
  });

  const orchestrator: OrganizationNode = {
    id: 'orchestrator',
    label: 'Orchestrator',
    kind: 'orchestrator',
    status: promptState(orchestratorPrompt),
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
      prompt: typeof orchestratorPrompt?.system_prompt === 'string' ? orchestratorPrompt.system_prompt : null,
      skills: orchestratorPrompt?.skills ?? [],
      memory: orchestratorPrompt?.memory_scope ?? null,
      preferredWorkflow: (orchestratorPrompt?.metadata as Record<string, unknown> | undefined)?.preferred_workflow ?? 'adaptive',
    },
  };

  const root: OrganizationNode = {
    id: 'you',
    label: 'YOU',
    kind: 'user',
    status: 'online',
    detail: 'Owner and approval authority',
    source: 'identity',
    children: [
      {
        id: 'axe-core',
        label: 'AXE CORE',
        kind: 'core',
        status: promptState(axeCorePrompt),
        detail: 'Single AI OS identity',
        source: axeCorePrompt ? 'core_agents' : 'organization',
        parentId: 'you',
        children: [
          orchestrator,
          {
            id: 'providers',
            label: 'Providers',
            kind: 'provider',
            status: providers.length ? 'configured' : 'unknown',
            detail: `${providers.length} providers`,
            source: 'providers',
            parentId: 'axe-core',
            children: providerNodes,
          },
          {
            id: 'models',
            label: 'Models',
            kind: 'model',
            status: models.length ? 'configured' : 'unknown',
            detail: `${models.length} registered models`,
            source: 'ollama_models',
            parentId: 'axe-core',
            children: modelNodes,
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
            id: 'infrastructure',
            label: 'Infrastructure',
            kind: 'infrastructure',
            status: infrastructure.length ? 'configured' : 'unknown',
            detail: `${infrastructure.length} services`,
            source: 'core_system_state',
            parentId: 'axe-core',
            children: infrastructure.map(item => toChildNode(item, 'infrastructure', 'infrastructure')),
          },
          {
            id: 'memory',
            label: 'Memory',
            kind: 'tool',
            status: memory.length ? memory[0].status : 'unknown',
            detail: memory[0]?.detail ?? 'No memory registry',
            source: 'core_memory',
            parentId: 'axe-core',
            children: memory.map(item => toChildNode(item, 'tool', 'memory')),
          },
        ],
        meta: {
          prompt: typeof axeCorePrompt?.system_prompt === 'string' ? axeCorePrompt.system_prompt : null,
          capabilities: capabilities.length,
          version: (axeCorePrompt?.metadata as Record<string, unknown> | undefined)?.version ?? 'registry',
          learningStatus: (axeCorePrompt?.metadata as Record<string, unknown> | undefined)?.learning_state ?? 'not_registered',
        },
      },
    ],
  };

  return { generatedAt: registry.generatedAt, root, registry };
}
