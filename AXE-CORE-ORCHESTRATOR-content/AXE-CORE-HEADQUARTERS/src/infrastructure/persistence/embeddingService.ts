/**
 * embeddingService — local-first vector embeddings for AXE memory.
 *
 * Priority:
 *  1. Ollama /api/embeddings (nomic-embed-text) when available
 *  2. Deterministic local hash embedding (no network) as fallback
 *
 * Used by ragMemoryService for semantic search so AXE retrieves
 * meaning-similar memories instead of keyword-only matches.
 */

const OLLAMA_URL =
  (import.meta.env.VITE_OLLAMA_URL as string | undefined)?.replace(/\/$/, '') ||
  'http://127.0.0.1:11434';
const EMBED_MODEL =
  (import.meta.env.VITE_EMBED_MODEL as string | undefined) || 'nomic-embed-text';

const LOCAL_DIM = 256;
const LS_EMBED_CACHE = 'axe_embed_cache_v1';

export type EmbeddingVector = number[];

function fnv1a(str: string): number {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** Deterministic bag-of-ngrams embedding — always available offline. */
export function localEmbed(text: string, dim = LOCAL_DIM): EmbeddingVector {
  const vec = new Array<number>(dim).fill(0);
  const t = text.toLowerCase().replace(/\s+/g, ' ').trim();
  if (!t) return vec;

  const tokens = t.split(/[^a-z0-9à-öø-ÿ]+/i).filter((w) => w.length > 1);
  for (const tok of tokens) {
    const h = fnv1a(tok) % dim;
    vec[h] += 1;
    if (tok.length >= 3) {
      const h2 = fnv1a(`#${tok.slice(0, 3)}`) % dim;
      vec[h2] += 0.5;
    }
  }
  // character bigrams for short / non-token text
  for (let i = 0; i < t.length - 1; i++) {
    const bg = t.slice(i, i + 2);
    const h = fnv1a(bg) % dim;
    vec[h] += 0.25;
  }

  let mag = 0;
  for (let i = 0; i < dim; i++) mag += vec[i] * vec[i];
  mag = Math.sqrt(mag) || 1;
  for (let i = 0; i < dim; i++) vec[i] /= mag;
  return vec;
}

export function cosineSimilarity(a: EmbeddingVector, b: EmbeddingVector): number {
  const n = Math.min(a.length, b.length);
  if (n === 0) return 0;
  let dot = 0;
  for (let i = 0; i < n; i++) dot += a[i] * b[i];
  // vectors are L2-normalized when produced here
  return dot;
}

function cacheGet(key: string): EmbeddingVector | null {
  try {
    const raw = localStorage.getItem(LS_EMBED_CACHE);
    if (!raw) return null;
    const map = JSON.parse(raw) as Record<string, EmbeddingVector>;
    return map[key] ?? null;
  } catch {
    return null;
  }
}

function cacheSet(key: string, vec: EmbeddingVector): void {
  try {
    const raw = localStorage.getItem(LS_EMBED_CACHE);
    const map = (raw ? JSON.parse(raw) : {}) as Record<string, EmbeddingVector>;
    map[key] = vec;
    const keys = Object.keys(map);
    if (keys.length > 400) {
      for (const k of keys.slice(0, keys.length - 300)) delete map[k];
    }
    localStorage.setItem(LS_EMBED_CACHE, JSON.stringify(map));
  } catch {
    /* quota */
  }
}

async function ollamaEmbed(text: string): Promise<EmbeddingVector | null> {
  try {
    const ctrl = new AbortController();
    const timer = window.setTimeout(() => ctrl.abort(), 2500);
    const res = await fetch(`${OLLAMA_URL}/api/embeddings`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: EMBED_MODEL, prompt: text.slice(0, 8000) }),
      signal: ctrl.signal,
    });
    window.clearTimeout(timer);
    if (!res.ok) return null;
    const data = (await res.json()) as { embedding?: number[] };
    if (!Array.isArray(data.embedding) || data.embedding.length < 8) return null;
    // normalize
    const v = data.embedding.slice();
    let mag = 0;
    for (let i = 0; i < v.length; i++) mag += v[i] * v[i];
    mag = Math.sqrt(mag) || 1;
    for (let i = 0; i < v.length; i++) v[i] /= mag;
    return v;
  } catch {
    return null;
  }
}

/**
 * Embed text. Tries Ollama first (real semantic vectors), falls back to local.
 * Results are cached in localStorage by content hash.
 */
export async function embedText(text: string): Promise<EmbeddingVector> {
  const key = `${EMBED_MODEL}:${fnv1a(text.slice(0, 2000)).toString(16)}`;
  const cached = cacheGet(key);
  if (cached) return cached;

  const remote = await ollamaEmbed(text);
  const vec = remote ?? localEmbed(text);
  cacheSet(key, vec);
  return vec;
}

/** Sync path for ranking when vectors are already stored. */
export function embedTextSync(text: string): EmbeddingVector {
  return localEmbed(text);
}
