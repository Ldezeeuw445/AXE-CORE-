/**
 * kimiClawService.ts
 * KimiClaw — Web intelligence & browser automation via AXE Core API.
 * Uses the same pattern as axeCoreApiService.
 */

// See axeCoreApiService.ts — dev always routes through the same-origin
// /proxy/axecore Vite proxy to avoid browser-side CORS against the VPS API.
const BASE_URL = (
  import.meta.env.DEV
    ? '/proxy/axecore'
    : (import.meta.env.VITE_AXE_CORE_API_URL ?? '')
).replace(/\/$/, '');
const API_KEY  = import.meta.env.VITE_AXE_CORE_API_KEY ?? '';

async function call<T = unknown>(method: string, path: string, body?: unknown): Promise<T> {
  if (!BASE_URL || !API_KEY) {
    throw new Error('AXE Core API not configured. Set VITE_AXE_CORE_API_URL and VITE_AXE_CORE_API_KEY.');
  }
  const res = await fetch(`${BASE_URL}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(`KimiClaw ${res.status}: ${err.detail ?? res.statusText}`);
  }
  return res.json();
}

// ══════════════════════════════════════════════════════════════════════════════
// KIMICLAW — Web Intelligence
// ══════════════════════════════════════════════════════════════════════════════

export interface ClawSearchResult {
  title: string;
  url: string;
  snippet: string;
  source: string;
}

export interface ClawAnalysisResult {
  url: string;
  title: string;
  summary: string;
  keyPoints: string[];
  sentiment: 'positive' | 'neutral' | 'negative';
  entities: Array<{ name: string; type: string }>;
}

export async function clawSearch(query: string, numResults = 5): Promise<ClawSearchResult[]> {
  return call('POST', '/kimi/claw/search', { query, num_results: numResults });
}

export async function clawAnalyze(url: string): Promise<ClawAnalysisResult> {
  return call('POST', '/kimi/claw/analyze', { url });
}

export async function clawScrape(url: string, extractText = true): Promise<{ url: string; text: string; links: string[] }> {
  return call('POST', '/kimi/claw/scrape', { url, extract_text: extractText });
}

export async function clawDeepResearch(query: string): Promise<{ query: string; findings: string; sources: ClawSearchResult[] }> {
  return call('POST', '/kimi/claw/research', { query });
}

// ══════════════════════════════════════════════════════════════════════════════
// KIMI CODE — Code Generation & Review
// ══════════════════════════════════════════════════════════════════════════════

export interface CodeResult {
  code: string;
  language: string;
  explanation: string;
  suggestions?: string[];
}

export async function kimiCodeGenerate(prompt: string, language?: string, context?: string): Promise<CodeResult> {
  return call('POST', '/kimi/code/generate', { prompt, language, context });
}

export async function kimiCodeReview(code: string, language?: string): Promise<CodeResult> {
  return call('POST', '/kimi/code/review', { code, language });
}

export async function kimiCodeDebug(code: string, error?: string, language?: string): Promise<CodeResult> {
  return call('POST', '/kimi/code/debug', { code, error, language });
}

// ══════════════════════════════════════════════════════════════════════════════
// KIMI WORK — Document Analysis
// ══════════════════════════════════════════════════════════════════════════════

export interface WorkResult {
  summary: string;
  keyPoints: string[];
  actionItems?: string[];
  sentiment?: string;
}

export async function kimiWorkSummarize(text: string, maxLength?: number): Promise<WorkResult> {
  return call('POST', '/kimi/work/summarize', { text, max_length: maxLength });
}

export async function kimiWorkAnalyzeDocument(text: string, docType?: string): Promise<WorkResult> {
  return call('POST', '/kimi/work/analyze', { text, doc_type: docType });
}

export async function kimiWorkExtractEntities(text: string): Promise<{ entities: Array<{ name: string; type: string; value?: string }> }> {
  return call('POST', '/kimi/work/entities', { text });
}

// ══════════════════════════════════════════════════════════════════════════════
// IN-APP BROWSER
// ══════════════════════════════════════════════════════════════════════════════

export interface BrowserFetchResult {
  url: string;
  title: string;
  text: string;
  html: string;
  links: Array<{ text: string; href: string }>;
  images: Array<{ alt: string; src: string }>;
}

export async function browserFetch(url: string, waitFor?: string): Promise<BrowserFetchResult> {
  // ── Try VPS proxy first (bypasses IP blocks from data-centre ranges) ──────
  try {
    const vpsRes = await fetch(`/api/browse-vps?url=${encodeURIComponent(url)}`, {
      signal: AbortSignal.timeout(18_000),
    });
    if (vpsRes.ok) {
      const d = await vpsRes.json() as { title?: string; description?: string; text?: string; links?: string[]; url?: string };
      // Normalise to BrowserFetchResult shape
      return {
        url: d.url ?? url,
        title: d.title ?? '',
        description: d.description ?? '',
        html: d.text ?? '',
        links: (d.links ?? []).map(href => ({ text: href, href })),
        images: [],
      };
    }
  } catch { /* VPS unavailable — fall through to KimiClaw */ }

  // ── Fallback: KimiClaw VPS API ────────────────────────────────────────────
  return call('POST', '/browser/fetch', { url, wait_for: waitFor });
}

export async function browserSearch(query: string, numResults = 5): Promise<Array<{ title: string; url: string; snippet: string }>> {
  return call('POST', '/browser/search', { query, num_results: numResults });
}

export async function browserAnalyze(url: string): Promise<{
  url: string;
  seo: { title: string; description: string; keywords: string[] };
  headings: string[];
  links: number;
  images: number;
  loadTime: number;
}> {
  return call('POST', '/browser/analyze', { url });
}

export async function browserSession(): Promise<{ active: boolean; currentUrl?: string; pages?: string[] }> {
  return call('GET', '/browser/session');
}

export async function browserCloseSession(): Promise<{ closed: boolean }> {
  return call('DELETE', '/browser/session');
}

export async function browserHealth(): Promise<{ status: string; latency: number }> {
  return call('GET', '/browser/health');
}
