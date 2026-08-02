/**
 * runCrewWithTools — always attach configured research tool env to /crew/run.
 * Exa key is read from existing Settings (axe_llm_connections.exa).
 */
import { crewRun, type CrewRunRequest } from '@/infrastructure/gateways/axeCoreApiService';
import { buildCrewToolEnv, getCrewToolStatus } from '@/infrastructure/persistence/crewToolsConfigService';
import { exaSearch } from '@/infrastructure/gateways/exaSearchService';

export async function runCrewWithTools(
  req: Omit<CrewRunRequest, 'tool_env'>,
): Promise<{ status: string; result?: string; error?: string; tools?: Record<string, boolean> }> {
  const [tool_env, status] = await Promise.all([buildCrewToolEnv(), getCrewToolStatus()]);

  // Optional client-side Exa pre-brief so research has live links even if VPS tools lag
  let context = req.context || '';
  if (status.exa && req.task.trim()) {
    try {
      const hits = await exaSearch(req.task.slice(0, 200), 5);
      if (hits && typeof hits === 'object') {
        context = [context, '## Exa pre-search', JSON.stringify(hits).slice(0, 6000)]
          .filter(Boolean)
          .join('\n\n');
      }
    } catch {
      /* non-fatal */
    }
  }

  const res = await crewRun({
    ...req,
    context: context || undefined,
    tool_env: Object.keys(tool_env).length ? tool_env : undefined,
  } as CrewRunRequest);

  return { ...res, tools: status as unknown as Record<string, boolean> };
}
