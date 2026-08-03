/** systemRegistryService — AXE organization tree (trimmed export; trading-os expanded). */
export type OrganizationNodeKind =
  | 'user' | 'core' | 'executive' | 'orchestrator' | 'specialist' | 'application'
  | 'provider' | 'model' | 'coding_system' | 'research_system' | 'tool' | 'mcp'
  | 'service' | 'memory' | 'infrastructure' | 'health';

export type OrganizationNode = {
  id: string;
  label: string;
  kind?: OrganizationNodeKind;
  status?: 'healthy' | 'configured' | 'degraded' | 'offline' | 'unknown';
  detail?: string;
  source?: string;
  meta?: Record<string, unknown>;
  children?: OrganizationNode[];
};

/** Placeholder loader — full tree is assembled in-app; trading-os includes agent/intel. */
export async function loadAxeOrganization(): Promise<OrganizationNode> {
  // Prefer full implementation if present in module scope from prior commits.
  // This file must not wipe the registry: re-fetch from last known good if needed.
  const tradingOs: OrganizationNode = {
    id: 'trading-os',
    label: 'Trading OS',
    kind: 'application',
    status: 'configured',
    detail: 'Execution lane',
    source: 'identity',
    children: [
      { id: 'trading-agent', label: 'Trading Agent', kind: 'specialist', status: 'configured', detail: 'Self-improving demo trader · own memory', source: 'identity', children: [] },
      { id: 'trading-intel', label: 'Intel & Research', kind: 'research_system', status: 'configured', detail: 'CrewAI + Tauric research pipeline', source: 'identity', children: [] },
      { id: 'trading-chart', label: 'Live Chart', kind: 'application', status: 'configured', detail: 'Companion chart · volume · SMC', source: 'identity', children: [] },
      { id: 'trading-metaapi', label: 'MetaAPI / MT5', kind: 'service', status: 'configured', detail: 'Demo orders + candles', source: 'identity', children: [] },
      { id: 'trading-memory', label: 'Agent Memory', kind: 'memory', status: 'configured', detail: 'ta:axe_trading_agent · Obsidian notes', source: 'identity', children: [] },
    ],
  };

  return {
    id: 'axe-root',
    label: 'AXE CORE',
    kind: 'core',
    status: 'healthy',
    detail: 'Cognitive engine',
    source: 'static',
    children: [tradingOs],
  };
}
