/** Qdrant vector DB client for AXE knowledge / validated intel. */
import { getCrewToolsConfig } from '@/infrastructure/persistence/crewToolsConfigService';

function headers(apiKey?: string): HeadersInit {
  const h: Record<string, string> = { 'Content-Type': 'application/json' };
  if (apiKey) h['api-key'] = apiKey;
  return h;
}

export async function qdrantEnsureCollection(vectorSize = 1536): Promise<{ ok: boolean; error?: string }> {
  const cfg = await getCrewToolsConfig();
  const base = cfg.qdrantUrl?.replace(/\/$/, '');
  if (!base) return { ok: false, error: 'QDRANT_URL not configured' };
  const collection = cfg.qdrantCollection || 'axe_knowledge';

  try {
    const exists = await fetch(`${base}/collections/${collection}`, {
      headers: headers(cfg.qdrantApiKey),
    });
    if (exists.ok) return { ok: true };

    const create = await fetch(`${base}/collections/${collection}`, {
      method: 'PUT',
      headers: headers(cfg.qdrantApiKey),
      body: JSON.stringify({
        vectors: { size: vectorSize, distance: 'Cosine' },
      }),
    });
    if (!create.ok) {
      const t = await create.text();
      return { ok: false, error: `Create collection ${create.status}: ${t.slice(0, 200)}` };
    }
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

export async function qdrantUpsertText(input: {
  id: string | number;
  text: string;
  vector: number[];
  payload?: Record<string, unknown>;
}): Promise<{ ok: boolean; error?: string }> {
  const cfg = await getCrewToolsConfig();
  const base = cfg.qdrantUrl?.replace(/\/$/, '');
  if (!base) return { ok: false, error: 'QDRANT_URL not configured' };
  const collection = cfg.qdrantCollection || 'axe_knowledge';

  try {
    const res = await fetch(`${base}/collections/${collection}/points?wait=true`, {
      method: 'PUT',
      headers: headers(cfg.qdrantApiKey),
      body: JSON.stringify({
        points: [
          {
            id: input.id,
            vector: input.vector,
            payload: { text: input.text, ...(input.payload || {}) },
          },
        ],
      }),
    });
    if (!res.ok) {
      const t = await res.text();
      return { ok: false, error: `Upsert ${res.status}: ${t.slice(0, 200)}` };
    }
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

export async function qdrantSearch(vector: number[], limit = 5): Promise<{ ok: boolean; results?: unknown; error?: string }> {
  const cfg = await getCrewToolsConfig();
  const base = cfg.qdrantUrl?.replace(/\/$/, '');
  if (!base) return { ok: false, error: 'QDRANT_URL not configured' };
  const collection = cfg.qdrantCollection || 'axe_knowledge';

  try {
    const res = await fetch(`${base}/collections/${collection}/points/search`, {
      method: 'POST',
      headers: headers(cfg.qdrantApiKey),
      body: JSON.stringify({ vector, limit, with_payload: true }),
    });
    if (!res.ok) {
      const t = await res.text();
      return { ok: false, error: `Search ${res.status}: ${t.slice(0, 200)}` };
    }
    return { ok: true, results: await res.json() };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}
