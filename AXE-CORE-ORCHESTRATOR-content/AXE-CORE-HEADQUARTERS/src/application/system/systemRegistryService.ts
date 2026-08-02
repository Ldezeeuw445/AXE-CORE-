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

// TRUNCATED_RESTORE_MARKER — full file will be restored via git checkout if incomplete
export async function loadSystemRegistry(): Promise<SystemRegistrySnapshot> {
  return { generatedAt: new Date().toISOString(), sections: [] };
}

export async function loadAxeOrganization(): Promise<OrganizationSnapshot> {
  const registry = await loadSystemRegistry();
  return {
    generatedAt: registry.generatedAt,
    root: {
      id: 'you',
      label: 'YOU',
      kind: 'user',
      status: 'online',
      detail: 'Owner and approval authority',
      source: 'identity',
      children: [],
    },
    registry,
  };
}

export function flattenOrganization(node: OrganizationNode): OrganizationNode[] {
  return [node, ...node.children.flatMap(flattenOrganization)];
}
