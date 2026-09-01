/**
 * systemRegistryService — organization tree for Architecture (RuntimeCanvas).
 * Returns OrganizationSnapshot { root } so Home Architecture can zoom Skilltree-style.
 */

export type RegistryStatus = 'online' | 'healthy' | 'configured' | 'degraded' | 'offline' | 'unknown';

export type OrganizationNodeKind =
  | 'user' | 'core' | 'executive' | 'orchestrator' | 'specialist' | 'application'
  | 'provider' | 'model' | 'coding_system' | 'research_system' | 'tool' | 'mcp'
  | 'service' | 'memory' | 'infrastructure' | 'health';

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

export type OrganizationNode = {
  id: string;
  label: string;
  /**
   * Always present. n() takes it as a required parameter.
   *
   * Left optional this read as safe and was not: consumers do
   * `KIND_STYLE[node.kind].icon`, which throws on a node without a kind
   * rather than falling back. Same shape as the crash that took the whole
   * trading tab down -- a lookup that returns undefined and is used anyway.
   */
  kind: OrganizationNodeKind;
  status?: RegistryStatus;
  detail?: string;
  source?: string;
  parentId?: string;
  meta?: Record<string, unknown>;
  /**
   * Always present, empty for a leaf.
   *
   * This was optional, and every consumer paid for it: 25 "possibly
   * undefined" errors across Organization, ArchitectureCanvas and
   * RuntimeInspector, for a field that no producer has ever left out --
   * every node in this file is built by n(), which defaults it to [].
   *
   * An optional field that is never actually absent is worse than a
   * required one: it makes real code look unsafe, so the guards get
   * written by reflex and stop meaning anything.
   */
  children: OrganizationNode[];
};

export type OrganizationSnapshot = {
  generatedAt: string;
  root: OrganizationNode;
};

function n(
  id: string,
  label: string,
  kind: OrganizationNodeKind,
  detail: string,
  children: OrganizationNode[] = [],
  status: RegistryStatus = 'configured',
): OrganizationNode {
  return { id, label, kind, status, detail, source: 'identity', children };
}

interface StoredCustomAgent {
  id: string;
  display_name?: string;
  name?: string;
  role?: string;
  description?: string;
  status?: string;
  tags?: string[];
}

interface StoredLocalCapability {
  capability: string;
  display_name?: string;
  description?: string;
  preferred_agent?: string;
}

/**
 * THINKTHANKS-built agents (axe_custom_agents_v1) as real Architecture nodes.
 * Without this, BUILD/INTEGRATE could create a live agent that the app never
 * showed anywhere on the org chart — the generated integrate action plan
 * literally promises "Architecture visibility: surface under
 * Capabilities/Memory on the Architecture map", but nothing ever read this
 * store here to make that true.
 */
function loadThinkThanksAgentNodes(): OrganizationNode[] {
  try {
    const raw = localStorage.getItem('axe_custom_agents_v1');
    const list = raw ? (JSON.parse(raw) as StoredCustomAgent[]) : [];
    if (!Array.isArray(list)) return [];
    return list
      .filter(a => (a.tags || []).includes('thinkthanks'))
      .slice(0, 30)
      .map(a =>
        n(
          `tt-agent-${a.id}`,
          (a.display_name || a.name || a.id).slice(0, 40),
          'specialist',
          `${a.role || 'agent'} · THINKTHANKS${a.status === 'active' ? '' : ' · standby'}`,
          [],
          a.status === 'active' ? 'online' : 'configured',
        ),
      );
  } catch {
    return [];
  }
}

/**
 * Non-agent THINKTHANKS capabilities (axe_local_capabilities_v1) grouped
 * under their own branch, same reasoning as loadThinkThanksAgentNodes above.
 */
function loadThinkThanksCapabilityNode(): OrganizationNode | null {
  try {
    const raw = localStorage.getItem('axe_local_capabilities_v1');
    const list = raw ? (JSON.parse(raw) as StoredLocalCapability[]) : [];
    if (!Array.isArray(list) || !list.length) return null;
    const items = list
      .filter(c => c.capability?.startsWith('tt-'))
      .slice(0, 30)
      .map(c => n(`tt-cap-${c.capability}`, (c.display_name || c.capability).slice(0, 40), 'tool', c.description?.slice(0, 80) || 'THINKTHANKS capability'));
    if (!items.length) return null;
    return n('thinkthanks-growth', 'THINKTHANKS Growth', 'application', 'Built + integrated blueprints', items);
  } catch {
    return null;
  }
}

/** Full Skilltree-style org tree used by RuntimeCanvas / Architecture. */
export async function loadAxeOrganization(): Promise<OrganizationSnapshot> {
  const tradingOs = n('trading-os', 'Trading OS', 'application', 'Agent · Intel · Chart · MetaAPI', [
    n('trading-agent', 'Trading Agent', 'specialist', 'Self-improving demo trader'),
    n('trading-intel', 'Intel & Research', 'research_system', 'CrewAI + Tauric pipeline'),
    n('trading-chart', 'Live Chart', 'application', 'Companion · volume · SMC'),
    n('trading-metaapi', 'MetaAPI / MT5', 'service', 'Demo orders + candles'),
    n('trading-memory', 'Agent Memory', 'memory', 'ta:axe_trading_agent · Obsidian'),
  ]);

  const applications = n('applications', 'Applications', 'application', 'Product surfaces', [
    tradingOs,
    n('eve', 'EVE', 'application', 'Executive assistant surface'),
    n('finance', 'Finance', 'application', 'P&L and books'),
    n('calendar', 'Calendar', 'application', 'Schedule'),
    n('tasks', 'Tasks', 'application', 'Mission control tasks'),
  ]);

  const providers = n('providers', 'Providers', 'provider', 'LLM providers', [
    n('anthropic', 'Anthropic', 'provider', 'Claude', [
      n('claude-sonnet', 'Claude Sonnet', 'model', 'Balanced'),
      n('claude-opus', 'Claude Opus', 'model', 'Deep'),
    ]),
    n('openai', 'OpenAI', 'provider', 'GPT', [
      n('gpt-4o', 'GPT-4o', 'model', 'Multimodal'),
    ]),
    n('google', 'Google', 'provider', 'Gemini', [
      n('gemini-flash', 'Gemini Flash', 'model', 'Fast'),
    ]),
    n('openrouter', 'OpenRouter', 'provider', 'Multi-model'),
    n('ollama', 'Ollama', 'provider', 'Local'),
    n('xai', 'xAI', 'provider', 'Grok'),
  ]);

  const memory = n('memory-hub', 'Memory', 'memory', 'Stores and RAG', [
    n('global-memory', 'Global Memory', 'memory', 'Shared keys'),
    n('rag-store', 'RAG Store', 'memory', 'Embeddings'),
    n('obsidian-vault', 'Obsidian Vault', 'memory', 'Notes graph'),
    n('agent-memory', 'Agent Memories', 'memory', 'Per-agent recall'),
    n('trading-mem', 'Trading Memory', 'memory', 'Trade decisions'),
  ]);

  const tools = n('tools', 'Tools', 'tool', 'Agent tools', [
    n('crewai', 'CrewAI', 'tool', 'Multi-agent crews'),
    n('browser', 'Browser', 'tool', 'Web research'),
    n('code-editor', 'Code Editor', 'tool', 'Repo edits'),
    n('maps-3d', '3D Maps', 'tool', 'Living display maps'),
  ]);

  const mcp = n('mcp-servers', 'MCP Servers', 'mcp', 'Connected bridges', [
    n('mcp-github', 'GitHub MCP', 'mcp', 'Repos and PRs'),
    n('mcp-supabase', 'Supabase MCP', 'mcp', 'Data plane'),
  ]);

  const infra = n('infrastructure', 'Infrastructure', 'infrastructure', 'Runtime hosts', [
    n('vps', 'VPS', 'infrastructure', 'Ollama · Crew · services'),
    n('tauri', 'Tauri Shell', 'infrastructure', 'Desktop app'),
  ]);

  const orchestrator = n('orchestrator', 'Orchestrator', 'orchestrator', 'Routes and cascades', [
    n('langgraph', 'LangGraph', 'orchestrator', 'Graph runtime'),
    n('stable-chat', 'Stable Chat', 'orchestrator', 'Simple cascade'),
  ]);

  const specialists = n('specialists', 'Specialists', 'specialist', 'Domain agents', [
    n('dollar-bill', 'Dollar Bill', 'specialist', 'Finance and trading'),
    n('research-agent', 'Research Agent', 'specialist', 'OSINT and intel'),
    n('code-agent', 'Code Agent', 'specialist', 'Repo work'),
    ...loadThinkThanksAgentNodes(),
  ]);

  const thinkthanksGrowth = loadThinkThanksCapabilityNode();

  const axeCore = n('axe-core', 'AXE CORE', 'core', 'Cognitive engine', [
    n('you', 'You', 'user', 'Luka'),
    n('executive', 'Executive', 'executive', 'EVE layer'),
    orchestrator,
    specialists,
    applications,
    providers,
    tools,
    mcp,
    memory,
    infra,
    n('health', 'Health', 'health', 'Service probes'),
    ...(thinkthanksGrowth ? [thinkthanksGrowth] : []),
  ]);

  return {
    generatedAt: new Date().toISOString(),
    root: axeCore,
  };
}

export async function loadSystemRegistry(): Promise<SystemRegistrySnapshot> {
  const { root } = await loadAxeOrganization();
  const flat = flattenOrganization(root).filter((x) => x.id !== root.id);
  const sections: RegistrySection[] = [
    {
      id: 'applications',
      title: 'Applications',
      description: 'Product surfaces',
      items: flat.filter((x) => x.kind === 'application').map((x) => ({
        id: x.id, label: x.label, status: x.status ?? 'configured', detail: x.detail, source: x.source ?? 'identity',
      })),
    },
    {
      id: 'providers',
      title: 'Providers',
      description: 'LLM providers',
      items: flat.filter((x) => x.kind === 'provider').map((x) => ({
        id: x.id, label: x.label, status: x.status ?? 'configured', detail: x.detail, source: x.source ?? 'identity',
      })),
    },
    {
      id: 'memory',
      title: 'Memory',
      description: 'Persistent stores',
      items: flat.filter((x) => x.kind === 'memory').map((x) => ({
        id: x.id, label: x.label, status: x.status ?? 'configured', detail: x.detail, source: x.source ?? 'identity',
      })),
    },
  ];
  return { generatedAt: new Date().toISOString(), sections };
}

export function flattenOrganization(root: OrganizationNode): OrganizationNode[] {
  const out: OrganizationNode[] = [];
  const stack: OrganizationNode[] = [root];
  while (stack.length) {
    const node = stack.pop()!;
    out.push(node);
    if (node.children?.length) stack.push(...node.children);
  }
  return out;
}
