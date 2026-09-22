import { describe, it, expect, vi } from 'vitest';
vi.mock('@/infrastructure/persistence/agentFeedbackService', () => ({ closeTradingEpisodeForTrade: vi.fn(), closeDeskEpisodesForTrade: vi.fn() }));
vi.mock('@/infrastructure/persistence/userSettingsService', () => ({ loadSetting: vi.fn(), saveSetting: vi.fn() }));
vi.mock('@/infrastructure/persistence/tradingAgentMemoryService', () => ({ rememberLesson: vi.fn() }));
vi.mock('@/infrastructure/persistence/tradingAgentBrain', () => ({ recordOutcome: vi.fn() }));
vi.mock('@/infrastructure/persistence/tradeNotesService', () => ({ writeTradeNote: vi.fn() }));
vi.mock('@/infrastructure/persistence/tradingLedgerService', () => ({ recordLedgerTrade: vi.fn() }));
import { learnedKnobsFor } from './tradingLearningService';
import { ALL_EVIDENCE, evidencePolicyFor } from '@/domain/tradingIntel/evidence';
import type { AgentLearningStats, LearningOutcome } from '@/domain/tradingIntel/botTypes';

const o = (win: boolean, environment?: LearningOutcome['environment']): LearningOutcome =>
  ({ pnl: win ? 1 : -1, win, symbol: 'XAUUSD', closedAt: '', environment });

describe('learnedKnobsFor — de vertrouwensvloer per soort bewijs', () => {
  const stats = {
    tradesClosed: 30, wins: 25, losses: 5, winRate: 0.83, learnedMinConfidence: 0.5, aggressiveness: 0.2,
    // 25 demo-winsten en 5 live-verliezen.
    recentOutcomes: [...Array(25).fill(0).map(() => o(true, 'demo')), ...Array(5).fill(0).map(() => o(false, 'live'))],
    updatedAt: '',
  } as AgentLearningStats;

  it('een demo-reeks verlaagt de vloer voor een demo-account', () => {
    expect(learnedKnobsFor(stats, ALL_EVIDENCE).learnedMinConfidence).toBeLessThan(0.58);
  });

  it('maar niet voor een funded/live account: te weinig eigen uitkomsten = neutraal', () => {
    const k = learnedKnobsFor(stats, evidencePolicyFor('live'));
    expect(k.sample).toBe(5);
    expect(k.learnedMinConfidence).toBe(0.58);
  });

  it('oude uitkomsten zonder omgeving tellen alleen waar legacy mag', () => {
    const legacy = { ...stats, recentOutcomes: Array(20).fill(0).map(() => o(true)) } as AgentLearningStats;
    expect(learnedKnobsFor(legacy, evidencePolicyFor('live')).sample).toBe(0);
    expect(learnedKnobsFor(legacy, ALL_EVIDENCE).sample).toBe(20);
  });
});
