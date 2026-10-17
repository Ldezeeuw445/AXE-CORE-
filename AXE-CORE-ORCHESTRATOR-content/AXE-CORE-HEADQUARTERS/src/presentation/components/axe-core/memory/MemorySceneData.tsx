/**
 * Optionele bron voor de scene-preview (Playwright). Productieviews
 * wrappen dit niet, dus die blijven de echte memory-APIs lezen.
 */
import { createContext, useContext } from 'react';
import type { HubMemoryRecord, MemoryAgentEvent } from '@/domain/memory/hubMemoryRecord';
import type { HubId } from '@/domain/memory/memoryHubs';

export interface MemorySceneSeed {
  records: HubMemoryRecord[];
  agentEvents: MemoryAgentEvent[];
  hubCounts: Partial<Record<HubId, number>>;
  total: number;
}

export const MemorySceneDataContext = createContext<MemorySceneSeed | null>(null);

export function useMemorySceneSeed(): MemorySceneSeed | null {
  return useContext(MemorySceneDataContext);
}
