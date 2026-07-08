import { getSupabase } from '@/lib/supabaseClient';
import { PROVIDERS } from '@/store/voiceStore';
import { getSystemState, type ServiceState } from '@/services/systemService';
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

  const [services, capabilities, mcpServers, agents, workflows, models, memoryCount] = await Promise.all([
    getSystemState(),
    loadCapabilities(),
    loadMcpServers(),
    loadAgents(),
    loadWorkflows(),
    loadSetting<LlmModelRegistryEntry[]>('axe_ollama_model_registry', getStoredLlmModelRegistry()),
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
    const h = JSON.parse(localStorage.getItem('axe_ollama_model_health') ?? '{}') as Record<string, { status?: string; lastTestAt?: string; lastError?: string; baseUrl?: string }>;
    const state = h[model.name];
    return {
      id: model.name,
      label: model.displayName,
      status: state?.status === 'ok' ? 'healthy' : state?.status === 'fail' ? 'offline' : 'configured',
      detail: model.description,
      source: 'ollama_models',
      meta: { baseUrl: state?.baseUrl ?? null, lastTestAt: state?.lastTestAt ?? null, category: model.category },
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
