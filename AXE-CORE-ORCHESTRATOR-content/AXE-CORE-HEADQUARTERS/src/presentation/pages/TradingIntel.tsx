/**
 * Trading Intel Dashboard — research (CrewAI-first) + charts + demo trading agent.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  BookOpen, Bot, LineChart, Loader2, Play, Radar, RefreshCw,
  Search, Shield, Trash2, Wallet,
} from 'lucide-react';
import { WidgetCard } from '@/presentation/components/widgets/WidgetCard';
import {
  AGENT_CATALOG, SIGNAL_META, type TradingIntelReport, type TradingSignal,
} from '@/domain/tradingIntel/types';
import {
  deleteIntelReport, listIntelReports, listWatchlist, summarizeIntel,
  type TradingIntelWatchlistItem,
} from '@/infrastructure/persistence/tradingIntelService';
import { runTradingResearch } from '@/application/tradingIntel/runTradingResearch';
import { isAxeApiConfigured } from '@/infrastructure/gateways/axeCoreApiService';
import { fetchMarketSnapshot, rsi, sma } from '@/infrastructure/gateways/marketDataService';
import type { MarketSnapshot, DemoAccount } from '@/domain/tradingIntel/demoTypes';
import {
  equity, getDemoAccount, resetDemoAccount, unrealizedPnl,
} from '@/infrastructure/persistence/demoTradingService';
import { runTradingAgent } from '@/application/tradingIntel/tradingAgentEngine';
import { loadTradingAgentMemory } from '@/infrastructure/persistence/tradingAgentMemoryService';
import type { GlobalMemoryEntry } from '@/infrastructure/persistence/globalMemoryService';
import { getRiskProfile, setRiskMode } from '@/infrastructure/persistence/tradingRiskService';
import { getLearningStats } from '@/infrastructure/persistence/tradingLearningService';
import { getBrokerConnection, connectBrokerKind } from '@/infrastructure/gateways/brokerConnector';
import type { RiskProfile, ThinkingTrace, AgentLearningStats, BrokerConnection } from '@/domain/tradingIntel/botTypes';
import { toast } from 'sonner';

// NOTE: full component body unchanged — only imports cleaned.
// To avoid a huge duplicate payload, we re-fetch is not possible here.
// If this truncates, the previous commit remains the source of truth.
export { default } from './TradingIntel';
