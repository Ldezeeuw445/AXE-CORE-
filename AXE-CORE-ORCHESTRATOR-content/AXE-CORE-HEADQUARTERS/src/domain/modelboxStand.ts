/**
 * De regel "Ollama box" in VPS Health, uit wat de VPS zelf meet.
 *
 * De modelbox laat de VPS op IP door en een browser alleen met een sleutel per
 * apparaat. De zijbalk mat hem vanuit de browser; zonder sleutel kwam er een
 * 401 zonder CORS-header terug, en dat leest een browser als "unreachable".
 * Op 20 okt stond de box zo op Mac en telefoon OFFLINE terwijl hij met twaalf
 * modellen antwoordde -- en de chat liep gewoon, want die gaat via de VPS.
 *
 * Dus: staat `checks.ollama_box` in /health (gezondheid.py), dan is dat de
 * waarheid. Zo niet (oude API), dan blijft de oude browsermeting, maar zonder
 * sleutel heet een mislukte meting niet meer "unreachable".
 */
export interface ModelboxStand {
  status: 'online' | 'degraded' | 'offline';
  detail: string;
}

export function modelboxUitHealth(check: unknown): ModelboxStand | null {
  if (!check || typeof check !== 'object') return null;
  const c = check as { state?: unknown; models?: unknown; detail?: unknown };
  const detail = typeof c.detail === 'string' ? c.detail : '';
  if (c.state === 'ok') {
    return {
      status: 'online',
      detail: typeof c.models === 'number' ? `ollama · ${c.models} models · via VPS` : 'ollama healthy · via VPS',
    };
  }
  if (c.state === 'fail') return { status: 'offline', detail: `${detail || 'down'} · measured by VPS` };
  return { status: 'degraded', detail: detail || 'unknown' };
}

export const ZONDER_SLEUTEL: ModelboxStand = {
  status: 'degraded',
  detail: 'no Ollama key on this device; chat still runs via the VPS',
};
