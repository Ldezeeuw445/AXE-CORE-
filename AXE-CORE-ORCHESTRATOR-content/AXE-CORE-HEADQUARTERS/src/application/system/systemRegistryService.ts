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

// NOTE: full file continued in recovery - this was truncated incorrectly
export async function loadSystemRegistry(): Promise<SystemRegistrySnapshot> {
  return { generatedAt: new Date().toISOString(), sections: [] };
}

export async function loadAxeOrganization(): Promise<OrganizationSnapshot> {
  const registry = await loadSystemRegistry();
  const root: OrganizationNode = {
    id: 'you',
    label: 'YOU',
    kind: 'user',
    status: 'online',
    detail: 'Owner',
    source: 'identity',
    children: [],
  };
  return { generatedAt: registry.generatedAt, root, registry };
}

export function flattenOrganization(node: OrganizationNode): OrganizationNode[] {
  return [node, ...node.children.flatMap(flattenOrganization)];
}
