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

export type RegistryItem = {
  id: string;
  label: string;
  status: 'online' | 'healthy' | 'configured' | 'degraded' | 'offline' | 'unknown';
  detail?: string;
};

export type RegistrySection = {
  id: string;
  title: string;
  description: string;
  items: RegistryItem[];
};

export type SystemRegistrySnapshot = {
  generatedAt: string;
  sections: RegistrySection[];
};

const SECTION_META: Partial<Record<OrganizationNodeKind, { title: string; description: string }>> = {
  provider: { title: 'Providers', description: 'Model/API providers configured for AXE Core.' },
  model: { title: 'Models', description: 'Language and reasoning models available to agents.' },
  service: { title: 'Services', description: 'Background services and integrations.' },
  mcp: { title: 'MCP', description: 'Connected MCP servers and tool bridges.' },
  memory: { title: 'Memory', description: 'Persistent memory stores.' },
  specialist: { title: 'Agents', description: 'Specialist and orchestrator agents.' },
  orchestrator: { title: 'Agents', description: 'Specialist and orchestrator agents.' },
  application: { title: 'Applications', description: 'Applications in the AXE ecosystem.' },
  tool: { title: 'Tools', description: 'Coding and research tools available to agents.' },
  coding_system: { title: 'Tools', description: 'Coding and research tools available to agents.' },
  research_system: { title: 'Tools', description: 'Coding and research tools available to agents.' },
  infrastructure: { title: 'Infrastructure', description: 'VPS and infrastructure nodes.' },
};

/** Flattens the live OrganizationNode tree into the grouped-section shape SystemRegistryPanel renders. */
export async function loadSystemRegistry(): Promise<SystemRegistrySnapshot> {
  const root = await loadAxeOrganization();
  const nodes = flattenOrganization(root).filter((n) => n.id !== root.id);

  const bySection = new Map<string, RegistryItem[]>();
  for (const node of nodes) {
    const meta = node.kind ? SECTION_META[node.kind] : undefined;
    if (!meta) continue;
    const item: RegistryItem = {
      id: node.id,
      label: node.label,
      status: node.status ?? 'unknown',
      detail: node.detail,
    };
    const existing = bySection.get(meta.title);
    if (existing) existing.push(item);
    else bySection.set(meta.title, [item]);
  }

  const sections: RegistrySection[] = Array.from(bySection.entries()).map(([title, items]) => {
    const meta = Object.values(SECTION_META).find((m) => m.title === title)!;
    return { id: title.toLowerCase().replace(/\s+/g, '-'), title, description: meta.description, items };
  });

  return { generatedAt: new Date().toISOString(), sections };
}

/** Flattens an OrganizationNode tree (root + all descendants) into a single array. */
export function flattenOrganization(root: OrganizationNode): OrganizationNode[] {
  const out: OrganizationNode[] = [];
  const stack: OrganizationNode[] = [root];
  while (stack.length) {
    const node = stack.pop()!;
    out.push(node);
    if (node.children) stack.push(...node.children);
  }
  return out;
}

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
