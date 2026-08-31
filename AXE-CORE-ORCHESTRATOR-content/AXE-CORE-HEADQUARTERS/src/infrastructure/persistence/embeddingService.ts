/**
 * embeddingService — vector embeddings for AXE memory.
 *
 * Priority:
 *  1. A local Ollama — fastest, and the only one that reliably answers
 *  2. The Ollama in Settings (the VPS) — for devices without a local one
 *  3. Deterministic hash embedding — lexical, not semantic
 *
 * Used by ragMemoryService so AXE retrieves meaning-similar memories rather
 * than keyword matches. Step 3 is a real loss of that capability, so it now
 * says so in the console once per session instead of failing silently.
 */
import { loadConnectionOverrides } from '@/domain/providers';
import { toProxied } from '@/infrastructure/gateways/llmGateway';

/**
 * Where Ollama actually is, according to Luka.
 *
 * This used to read VITE_OLLAMA_URL and fall back to 127.0.0.1 — an env var
 * that is not set, so it always meant "whatever machine has the browser open".
 * Meanwhile Settings had Ollama pointed at the VPS all along, and the chat was
 * happily using it. Two parts of the same app, two different ideas of where
 * Ollama lives, and only one of them was right.
 *
 * The Settings card is the source of truth, because it is the one Luka can
 * see and change. The env var stays as an override for a dev who wants a
 * local endpoint without touching Settings.
 */
function configuredOllamaUrl(): string | null {
  const fromSettings = loadConnectionOverrides('ollama').baseUrl;
  const raw = fromSettings ?? (import.meta.env.VITE_OLLAMA_URL as string | undefined);
  if (!raw) return null;
  // toProxied, or in dev the browser calls the VPS directly and CORS blocks it.
  // Every other gateway routes through this; leaving it out here meant the
  // remote step could never actually run from a dev build.
  return toProxied(raw.replace(/\/$/, ''));
}

const OLLAMA_URL = 'http://127.0.0.1:11434';
/**
 * bge-m3, not nomic-embed-text — because Luka writes Dutch.
 *
 * Measured on 31-08-2026, cosine similarity between three sentences: two about
 * trading with no words in common, and one about apple pie.
 *
 *                        same topic   unrelated   separation
 *   nomic-embed-text        0.660       0.706       -0.046
 *   bge-m3                  0.532       0.250       +0.282
 *
 * nomic ranks the apple pie ABOVE the related sentence. It is an English model
 * and on Dutch it returns noise — 768 real dimensions of it, which is worse
 * than the hash fallback it replaced only in that it costs a network call to
 * be equally useless. In English nomic is fine (0.573 vs 0.400); the language
 * is the whole difference.
 *
 * bge-m3 is explicitly multilingual, 1024 dimensions, ~0.9s per embedding
 * locally. That +0.28 separation is what makes ranking mean anything.
 */
const EMBED_MODEL =
  (import.meta.env.VITE_EMBED_MODEL as string | undefined) || 'bge-m3';

/**
 * The VPS, which is the only Ollama every device can reach.
 *
 * Embedding runs in the browser, so `127.0.0.1` means "whatever machine is
 * looking at AXE right now". On the iMac that is one Ollama, on the Mac Mini
 * another, and on the phone nothing at all — so memory quality silently
 * depended on which screen Luka happened to open. On mobile it ALWAYS fell
 * through to the hash, which is lexical, not semantic: "where did I get to
 * with trading" then matches nothing about "the portfolio widget", because
 * they share no words.
 *
 * In dev this goes through the /proxy/ollama vite route (CORS); in a packaged
 * app it is called directly.
 */
const VPS_OLLAMA_URL =
  (import.meta.env.VITE_OLLAMA_VPS_URL as string | undefined)?.replace(/\/$/, '') ||
  (import.meta.env.DEV ? '/proxy/ollama' : 'https://ollama.axecompanion.com');

/**
 * The hash fallback's width. Deliberately unlike any real model's, so a vector
 * from the fallback can never be silently compared against a model vector.
 */
const LOCAL_DIM = 256;
let warnedHashFallback = false;
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

async function ollamaEmbed(text: string, baseUrl = OLLAMA_URL, timeoutMs = 2500): Promise<EmbeddingVector | null> {
  try {
    const ctrl = new AbortController();
    const timer = window.setTimeout(() => ctrl.abort(), timeoutMs);
    const res = await fetch(`${baseUrl}/api/embeddings`, {
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
 * Embed text: local Ollama, then the VPS, then the hash.
 *
 * The VPS step is the one that matters. Without it the hash fallback was
 * reached on any device without a local Ollama — every phone, always — and
 * the hash is lexical. Retrieval then quietly stops finding anything that
 * does not repeat the same words, which is what made memory feel like one
 * undifferentiated pile rather than something that remembers.
 *
 * Local first because it is faster and free; the VPS gets a longer timeout
 * because it is a real network hop and 2.5s is not generous over mobile.
 * The hash stays as the last resort, so memory still degrades rather than
 * failing — but it is now genuinely last.
 */
export async function embedText(text: string): Promise<EmbeddingVector> {
  const key = `${EMBED_MODEL}:${fnv1a(text.slice(0, 2000)).toString(16)}`;
  const cached = cacheGet(key);
  if (cached) return cached;

  // Local first, and this order was corrected after measuring rather than
  // assumed. The VPS Ollama holds llama3 (6 GB) resident, so an embedding
  // request queues behind it: measured at 60s with no answer, while the same
  // call on the Mac Mini returns 768 dimensions in 7.7s. The remote is the
  // fallback, not the primary — it is what keeps a device without a local
  // Ollama (a phone) working, at the cost of latency.
  //
  // The timeouts follow from that: local gets room to load a cold model,
  // remote gets a ceiling that fails over to the hash rather than freezing
  // the turn.
  let remote = await ollamaEmbed(text, OLLAMA_URL, 15_000);
  let source: 'local' | 'remote' | 'hash' = remote ? 'local' : 'hash';

  if (!remote) {
    const configured = configuredOllamaUrl();
    if (configured) {
      remote = await ollamaEmbed(text, configured, 12_000);
      if (remote) source = 'remote';
    }
  }

  if (source === 'hash' && !warnedHashFallback) {
    // Once per session. Silent degradation is what hid this for so long:
    // retrieval kept working, it just stopped being about meaning.
    warnedHashFallback = true;
    console.warn(
      '%c[AXE memory]%c no embedding model reachable (local or VPS) — falling back to '
      + 'lexical hashing. Recall will match words, not meaning.',
      'color:#F59E0B;font-weight:600', 'color:inherit',
    );
  }

  const vec = remote ?? localEmbed(text);
  cacheSet(key, vec);
  return vec;
}

/** Sync path for ranking when vectors are already stored. */
export function embedTextSync(text: string): EmbeddingVector {
  return localEmbed(text);
}
