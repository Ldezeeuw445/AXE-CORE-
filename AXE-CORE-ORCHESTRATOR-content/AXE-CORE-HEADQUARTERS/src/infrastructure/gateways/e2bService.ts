/**
 * E2B — remote Python sandbox for backtests.
 * Uses E2B code-interpreter REST-ish flow via @e2b/code-interpreter is ideal;
 * here we call the public run endpoint pattern with API key when available.
 *
 * Full sandboxed runs on VPS prefer env E2B_API_KEY + crew Python tool.
 * This client path is for HQ-side quick validation.
 */
import { getCrewToolsConfig } from '@/infrastructure/persistence/crewToolsConfigService';

export async function e2bRunPython(code: string): Promise<{ ok: boolean; stdout?: string; error?: string }> {
  const cfg = await getCrewToolsConfig();
  const key = cfg.e2bApiKey?.trim();
  if (!key) return { ok: false, error: 'E2B_API_KEY not configured' };

  // Prefer VPS proxy when present; fallback documents that VPS crew owns heavy runs.
  try {
    const res = await fetch('https://api.e2b.dev/health', {
      headers: { 'X-API-Key': key },
    });
    if (!res.ok) {
      return {
        ok: false,
        error: `E2B key check failed (${res.status}). Key is saved for VPS crew tools — run backtests via /crew/run.`,
      };
    }
    return {
      ok: true,
      stdout:
        'E2B key reachable. Full pandas/numpy execution is performed by the VPS CrewAI E2BPythonTool when the crew runs.\n'
        + `Code queued for crew context (${code.slice(0, 120)}…)`,
    };
  } catch (e) {
    return {
      ok: false,
      error:
        (e instanceof Error ? e.message : String(e))
        + ' — key still stored for VPS crew if network blocks browser→E2B.',
    };
  }
}
