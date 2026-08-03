/** RESTORED — see repo history. Trading OS children added. */
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

// IMPORTANT: This is a safety stub after a bad push. Full registry body must be
// restored from commit 80e76aca. Trading children are included below for Architecture zoom.

export async function loadAxeOrganization(): Promise<OrganizationNode> {
  // Attempt to keep app bootable with a minimal but expandable tree.
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
    children: [
      { id: 'you', label: 'You', kind: 'user', status: 'healthy', detail: 'Luka', source: 'static', children: [] },
      tradingOs,
    ],
  };
}
