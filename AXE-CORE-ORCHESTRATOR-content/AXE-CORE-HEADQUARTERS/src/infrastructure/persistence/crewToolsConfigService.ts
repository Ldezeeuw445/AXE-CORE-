/** Persist CrewAI tool credentials (Firecrawl, E2B, Qdrant, Bright Data). Exa lives in llm connections. */
import { loadSetting, saveSetting } from '@/infrastructure/persistence/userSettingsService';
import type { CrewToolsConfig } from '@/domain/crew/crewTools';
import { CREW_TOOLS_SETTING } from '@/domain/crew/crewTools';
import { getExaApiKey } from '@/infrastructure/gateways/exaSearchService';

export async function getCrewToolsConfig(): Promise<CrewToolsConfig> {
  const cfg = await loadSetting<CrewToolsConfig>(CREW_TOOLS_SETTING, {});
  return cfg && typeof cfg === 'object' ? cfg : {};
}

export async function saveCrewToolsConfig(partial: Partial<CrewToolsConfig>): Promise<CrewToolsConfig> {
  const prev = await getCrewToolsConfig();
  const next: CrewToolsConfig = {
    ...prev,
    ...partial,
    updatedAt: new Date().toISOString(),
  };
  await saveSetting(CREW_TOOLS_SETTING, next);
  return next;
}

export interface CrewToolStatus {
  exa: boolean;
  firecrawl: boolean;
  brightdata: boolean;
  e2b: boolean;
  qdrant: boolean;
}

export async function getCrewToolStatus(): Promise<CrewToolStatus> {
  const [exa, cfg] = await Promise.all([getExaApiKey(), getCrewToolsConfig()]);
  return {
    exa: Boolean(exa),
    firecrawl: Boolean(cfg.firecrawlApiKey?.trim()),
    brightdata: Boolean(cfg.brightDataApiKey?.trim()),
    e2b: Boolean(cfg.e2bApiKey?.trim()),
    qdrant: Boolean(cfg.qdrantUrl?.trim()),
  };
}

/** Env map the VPS crew runner should apply before tool init */
export async function buildCrewToolEnv(): Promise<Record<string, string>> {
  const [exa, cfg] = await Promise.all([getExaApiKey(), getCrewToolsConfig()]);
  const env: Record<string, string> = {};
  if (exa) env.EXA_API_KEY = exa;
  if (cfg.firecrawlApiKey) env.FIRECRAWL_API_KEY = cfg.firecrawlApiKey.trim();
  if (cfg.brightDataApiKey) env.BRIGHTDATA_API_KEY = cfg.brightDataApiKey.trim();
  if (cfg.e2bApiKey) env.E2B_API_KEY = cfg.e2bApiKey.trim();
  if (cfg.qdrantUrl) env.QDRANT_URL = cfg.qdrantUrl.trim();
  if (cfg.qdrantApiKey) env.QDRANT_API_KEY = cfg.qdrantApiKey.trim();
  if (cfg.qdrantCollection) env.QDRANT_COLLECTION = cfg.qdrantCollection.trim();
  return env;
}
