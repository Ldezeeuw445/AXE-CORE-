/** Live services als dicht raster: toon per status en de sorteervolgorde. Puur. */
const VOLGORDE = ['supabase', 'github', 'n8n', 'langgraph', 'terminal', 'ollama', 'openhands', 'openjarvis', 'openclaw', 'kilocode', 'crewai', 'claude_code', 'hermes'];
export const VPS_DIENSTEN = new Set(['openhands', 'openjarvis', 'openclaw', 'kilocode', 'crewai', 'claude_code', 'hermes', 'ollama']);

export function dienstToon(status: string): 'ok' | 'let-op' | 'fout' | 'uit' {
  if (status === 'online') return 'ok';
  if (status === 'degraded') return 'let-op';
  if (status === 'offline' || status === 'error') return 'fout';
  return 'uit';
}

/** Storingen eerst, dan de vaste volgorde, dan de rest op naam. */
export function sorteerDiensten<T extends { service: string; status: string; display?: string | null }>(services: readonly T[]): T[] {
  const rang = (s: T) => (dienstToon(s.status) === 'fout' ? 0 : dienstToon(s.status) === 'let-op' ? 1 : 2);
  const plek = (s: T) => { const i = VOLGORDE.indexOf(s.service); return i < 0 ? 99 : i; };
  return [...services].sort((a, b) => rang(a) - rang(b) || plek(a) - plek(b) || (a.display || a.service).localeCompare(b.display || b.service));
}

