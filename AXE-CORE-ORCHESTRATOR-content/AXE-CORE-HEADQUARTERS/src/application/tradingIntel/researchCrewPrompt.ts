/**
 * Research crew task template — aligned with AXE research CrewAI flow:
 * multi-source data retrieval, specialist research, debate, validation.
 * Always preferred path for Trading Intel when VPS CrewAI is available.
 */

export function buildResearchCrewTask(input: {
  ticker: string;
  horizon?: string;
  notes?: string;
}): string {
  const { ticker, horizon = 'swing', notes } = input;
  return [
    `AXE TRADING INTEL — full research cycle for ${ticker}.`,
    `Horizon: ${horizon}.`,
    notes ? `Operator notes: ${notes}` : '',
    '',
    'You are the AXE research desk (CrewAI). Run a complete cycle:',
    '',
    '## 1) Data retrieval (multi-source)',
    '- Attempt historical OHLC context (Yahoo/Stooq-style thinking, regime, levels).',
    '- Event / positioning / fundamental context where relevant (macro calendar, flows, narrative).',
    '- Flag REAL_DATA_AVAILABLE only if concrete price series or levels are cited; otherwise mark FRAMEWORK_ESTIMATE.',
    '',
    '## 2) Specialist research',
    '- Macro / quant / correlation / risk angles as applicable to the asset.',
    '- Separate facts from narrative.',
    '',
    '## 3) Debate',
    '- Bull case vs Devil\'s Advocate / bear case.',
    '- Explicit consensus or unresolved tension.',
    '',
    '## 4) Validation',
    '- What would CONFIDENCE_VALIDATED require (real directional accuracy on OHLC)?',
    '- What is only framework support (COT, flows, narrative)?',
    '',
    '## Required output format',
    'SIGNAL: BUY|SELL|HOLD|WATCH|AVOID',
    'CONFIDENCE: 0.00-1.00',
    'DATA_QUALITY: REAL_DATA_AVAILABLE|FRAMEWORK_ESTIMATE',
    'THESIS: 3-6 sentences',
    'LEVELS: key support/resistance if any',
    'RISKS: bullets',
    'CATALYSTS: bullets',
    'TRADE_PLAN: entry / invalidation / size guidance (demo-safe)',
    'FULL_BRIEF: structured multi-section briefing',
    '',
    'Be precise. No fabricated prices. Not financial advice — research for AXE demo trading agent.',
  ]
    .filter(Boolean)
    .join('\n');
}

/** Specialists preferred for trading research crew runs */
export const RESEARCH_CREW_SPECIALISTS = ['axe_core', 'dollar_bill', 'intel'] as const;
