/** Canonical CrewAI research-tool stack for AXE CORE. */

export type CrewToolId = 'exa' | 'firecrawl' | 'e2b' | 'qdrant' | 'brightdata';

export interface CrewToolDef {
  id: CrewToolId;
  label: string;
  purpose: string;
  envKey: string;
  /** Agents that primarily use this tool */
  agentRoles: string[];
}

export const CREW_TOOLS: CrewToolDef[] = [
  {
    id: 'exa',
    label: 'Exa Search',
    purpose: 'Real-time web/OSINT search for data & news agents',
    envKey: 'EXA_API_KEY',
    agentRoles: ['news_analyst', 'sentiment_analyst', 'fundamentals_analyst', 'market_analyst'],
  },
  {
    id: 'firecrawl',
    label: 'Firecrawl',
    purpose: 'Scrape JS-heavy / 403 sites (Reuters, Investing, Bloomberg-style)',
    envKey: 'FIRECRAWL_API_KEY',
    agentRoles: ['news_analyst', 'fundamentals_analyst', 'research_manager'],
  },
  {
    id: 'brightdata',
    label: 'Bright Data',
    purpose: 'Optional proxy layer when Firecrawl alone is blocked',
    envKey: 'BRIGHTDATA_API_KEY',
    agentRoles: ['news_analyst'],
  },
  {
    id: 'e2b',
    label: 'E2B Python sandbox',
    purpose: 'Real pandas/numpy backtests → CONFIDENCE_VALIDATED scores',
    envKey: 'E2B_API_KEY',
    agentRoles: ['trader', 'risk_conservative', 'risk_aggressive', 'portfolio_manager'],
  },
  {
    id: 'qdrant',
    label: 'Qdrant',
    purpose: 'Vector store for validated intel / knowledge base search',
    envKey: 'QDRANT_URL',
    agentRoles: ['research_manager', 'portfolio_manager', 'axe_core'],
  },
];

export interface CrewToolsConfig {
  firecrawlApiKey?: string;
  brightDataApiKey?: string;
  e2bApiKey?: string;
  qdrantUrl?: string;
  qdrantApiKey?: string;
  qdrantCollection?: string;
  updatedAt?: string;
}

export const CREW_TOOLS_SETTING = 'axe_crew_tools_config';
