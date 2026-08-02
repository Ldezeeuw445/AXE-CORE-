/**
 * Trading Intel domain types.
 * Inspired by TauricResearch/TradingAgents multi-agent framework
 * (arXiv:2412.20138) — adapted for AXE CORE HQ storage & UI.
 *
 * Presentation never owns data. Services persist; UI only renders.
 */

export type TradingSignal = 'BUY' | 'SELL' | 'HOLD' | 'WATCH' | 'AVOID';

export type AgentRole =
  | 'market_analyst'
  | 'fundamentals_analyst'
  | 'news_analyst'
  | 'sentiment_analyst'
  | 'social_media_analyst'
  | 'bull_researcher'
  | 'bear_researcher'
  | 'research_manager'
  | 'trader'
  | 'risk_aggressive'
  | 'risk_conservative'
  | 'risk_neutral'
  | 'portfolio_manager';

export type IntelSource =
  | 'trading_agents'
  | 'crewai'
  | 'axe_core'
  | 'manual'
  | 'import'
  | 'market_data';

export type IntelStatus = 'draft' | 'running' | 'complete' | 'failed' | 'archived';

export type AssetClass = 'equity' | 'crypto' | 'forex' | 'commodity' | 'index' | 'other';

export interface AgentBrief {
  role: AgentRole;
  label: string;
  stance?: TradingSignal | 'BULL' | 'BEAR' | 'NEUTRAL';
  confidence: number; // 0–1
  summary: string;
  keyPoints: string[];
  raw?: string;
}

export interface TradingIntelReport {
  id: string;
  ticker: string;
  name?: string;
  assetClass: AssetClass;
  /** ISO date of analysis (YYYY-MM-DD) */
  asOf: string;
  status: IntelStatus;
  source: IntelSource;
  /** Final composite signal after debate + risk */
  signal: TradingSignal;
  confidence: number;
  thesis: string;
  risks: string[];
  catalysts: string[];
  priceTarget?: number;
  stopHint?: number;
  horizon?: string;
  agents: AgentBrief[];
  tags: string[];
  /** Free-form research notes / crew output */
  body: string;
  createdAt: string;
  updatedAt: string;
  /** Optional link to CrewAI run or external job */
  runRef?: string;
}

export interface TradingIntelWatchlistItem {
  ticker: string;
  name?: string;
  assetClass: AssetClass;
  notes?: string;
  addedAt: string;
}

export const AGENT_CATALOG: Array<{
  role: AgentRole;
  label: string;
  team: 'analysts' | 'researchers' | 'managers' | 'risk' | 'trader';
  description: string;
  color: string;
}> = [
  {
    role: 'market_analyst',
    label: 'Market Analyst',
    team: 'analysts',
    description: 'Technical structure, volume, indicators, levels',
    color: '#22D3EE',
  },
  {
    role: 'fundamentals_analyst',
    label: 'Fundamentals Analyst',
    team: 'analysts',
    description: 'Financials, valuation, balance sheet quality',
    color: '#34D399',
  },
  {
    role: 'news_analyst',
    label: 'News Analyst',
    team: 'analysts',
    description: 'Macro & company news flow impact',
    color: '#F59E0B',
  },
  {
    role: 'sentiment_analyst',
    label: 'Sentiment Analyst',
    team: 'analysts',
    description: 'Market sentiment scores & crowd mood',
    color: '#A78BFA',
  },
  {
    role: 'social_media_analyst',
    label: 'Social Media Analyst',
    team: 'analysts',
    description: 'Retail chatter, narratives, attention spikes',
    color: '#EC4899',
  },
  {
    role: 'bull_researcher',
    label: 'Bull Researcher',
    team: 'researchers',
    description: 'Builds the strongest long case',
    color: '#10B981',
  },
  {
    role: 'bear_researcher',
    label: 'Bear Researcher',
    team: 'researchers',
    description: 'Builds the strongest short / risk case',
    color: '#F87171',
  },
  {
    role: 'research_manager',
    label: 'Research Manager',
    team: 'managers',
    description: 'Synthesizes bull/bear debate into a stance',
    color: '#60A5FA',
  },
  {
    role: 'trader',
    label: 'Trader',
    team: 'trader',
    description: 'Timing, size, and actionable plan',
    color: '#FBBF24',
  },
  {
    role: 'risk_aggressive',
    label: 'Aggressive Risk',
    team: 'risk',
    description: 'Higher risk appetite perspective',
    color: '#FB7185',
  },
  {
    role: 'risk_conservative',
    label: 'Conservative Risk',
    team: 'risk',
    description: 'Capital preservation perspective',
    color: '#94A3B8',
  },
  {
    role: 'risk_neutral',
    label: 'Neutral Risk',
    team: 'risk',
    description: 'Balanced risk framing',
    color: '#A3E635',
  },
  {
    role: 'portfolio_manager',
    label: 'Portfolio Manager',
    team: 'managers',
    description: 'Final approve / reject of the trade plan',
    color: '#E879F9',
  },
];

export const SIGNAL_META: Record<
  TradingSignal,
  { label: string; color: string; bg: string }
> = {
  BUY: { label: 'Buy', color: '#34D399', bg: 'rgba(52,211,153,0.12)' },
  SELL: { label: 'Sell', color: '#F87171', bg: 'rgba(248,113,113,0.12)' },
  HOLD: { label: 'Hold', color: '#94A3B8', bg: 'rgba(148,163,184,0.12)' },
  WATCH: { label: 'Watch', color: '#FBBF24', bg: 'rgba(251,191,36,0.12)' },
  AVOID: { label: 'Avoid', color: '#F472B6', bg: 'rgba(244,114,182,0.12)' },
};
