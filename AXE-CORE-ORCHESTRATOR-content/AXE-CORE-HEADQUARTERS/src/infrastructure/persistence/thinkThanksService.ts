/**
 * THINKTHANKS — vision-analyse drops, score apps honestly, BUILD → library.
 */
import { callProvider, toProxied } from '@/infrastructure/gateways/llmGateway';
import type { KeySlot } from '@/domain/providers';
import { PROVIDERS, cascadeAround } from '@/domain/providers';
import { normalizeFiles, type NormalizedAttachment, formatSize } from '@/application/attachments/attachmentService';
import { useVoiceStore } from '@/presentation/store/voiceStore';
import { sanitizeLlmText } from '@/infrastructure/gateways/sanitizeLlmText';
import { saveSetting } from '@/infrastructure/persistence/userSettingsService';

export type TargetApp = 'axe-core' | 'axe-companion' | 'axon-memory' | 'trading-os';

export const TARGET_APPS: { id: TargetApp; label: string; color: string; purpose: string }[] = [
  { id: 'axe-core', label: 'AXE Core', color: '#22d3ee', purpose: 'Desktop HQ — agents, tools, orchestration.' },
  { id: 'axe-companion', label: 'AXE Companion', color: '#a855f7', purpose: 'Conversational trading assistant — charts, MetaAPI.' },
  { id: 'axon-memory', label: 'AXON Memory', color: '#34d399', purpose: 'Universal cross-app memory. NOT a trading bot.' },
  { id: 'trading-os', label: 'Trading OS', color: '#f59e0b', purpose: 'Charts, execution, intel, strategies.' },
];

export type ThinkItemKind = 'file' | 'image' | 'video' | 'audio' | 'link' | 'note' | 'instagram-reel' | 'binary';

export interface AppFitScore { app: TargetApp; percent: number; reason: string; }

export interface ActionPlanStep { phase: string; detail: string; }

export interface ThinkThanksAnalysis {
  title: string;
  description: string;
  whatItIs: string;
  howToUse: string;
  whyUseful: string;
  howToMake: string;
  smartNotes: string;
  placementUi?: string;
  placementBackend?: string;
  placementMemory?: string;
  actionPlan?: ActionPlanStep[];
  fits: AppFitScore[];
  overallUsefulness: number;
  tags: string[];
  analysedAt: number;
  enrichmentSummary?: string;
}

export interface ThinkThanksItem {
  id: string;
  createdAt: number;
  kind: ThinkItemKind;
  name: string;
  mime?: string;
  size?: number;
  sourceText?: string;
  url?: string;
  previewUrl?: string;
  textExcerpt?: string;
  analysis?: ThinkThanksAnalysis;
  analysisStatus: 'pending' | 'enriching' | 'analysing' | 'done' | 'error';
  analysisError?: string;
  builtAt?: number;
  builtApps?: TargetApp[];
  buildResult?: string;
  libraryCategory?: string;
  librarySummary?: string;
  /** Durable persistence status after BUILD */
  persistedTo?: {
    library: boolean;
    globalMemory: boolean;
    rag: boolean;
    obsidian: boolean;
    chatBrief: boolean;
  };
  /** Obsidian note path created on BUILD */
  libraryNotePath?: string;
  /** Plan generated for INTEGRATE (how to wire into live app) */
  integrateActionPlan?: ActionPlanStep[];
  integrateResult?: string;
  /** Live artifact created in-app (e.g. agent id in Agent Center) */
  liveArtifact?: {
    kind: 'agent' | 'capability' | 'note' | 'other';
    id: string;
    label: string;
    href?: string;
  };
  /** Real code-agent run during BUILD (patches applied to workspace + GitHub) */
  codeBuild?: {
    status: 'idle' | 'running' | 'done' | 'error' | 'skipped' | 'failed';
    message: string;
    patchesApplied: number;
    filesTouched: string[];
    /** Live transcript lines from the code agent */
    log?: string[];
    skillId?: string;
    at: number;
    /** ThinkTank GitHub publish */
    branch?: string;
    prUrl?: string;
    prNumber?: number;
    commitShas?: string[];
    publishedApps?: {
      appId: string;
      branch: string;
      prUrl: string;
      prNumber: number;
      filesWritten: string[];
    }[];
    mergedAt?: number;
    mergeResults?: {
      appId: string;
      merged: boolean;
      message: string;
      prNumber: number;
    }[];
  };
  /** Post-INTEGRATE verification */
  smokeCheck?: {
    ok: boolean;
    checks: { name: string; pass: boolean; detail: string }[];
    at: number;
  };
  integratedAt?: number;
  enrichedText?: string;
  lastReanalysedAt?: number;
}

export interface MergeSuggestion {
  id: string;
  itemIds: string[];
  titles: string[];
  reason: string;
  projectedPercent: number;
  bestApp: TargetApp;
  createdAt: number;
}

const STORAGE_KEY = 'axe_thinkthanks_items_v1';
const MAX_ITEMS = 80;

function uid(): string {
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

/**
 * Mirror a compact view of the library into user_settings.
 *
 * The store itself is localStorage, which means it exists in exactly one
 * browser -- the phone could never see a single idea. Only the counts and the
 * newest few titles go up; the full items stay local, so this costs one small
 * row rather than duplicating the library.
 */
function mirrorToCloud(items: ThinkThanksItem[]): void {
  void saveSetting('axe_thinkthanks_snapshot', {
    total: items.length,
    built: items.filter(i => !!i.builtAt).length,
    recent: items.slice(0, 5).map(i => ({
      title: (i.name || i.textExcerpt || '').slice(0, 80),
      status: i.analysisStatus,
      built: !!i.builtAt,
    })),
    updatedAt: new Date().toISOString(),
  });
}

function loadRaw(): ThinkThanksItem[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as ThinkThanksItem[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveRaw(items: ThinkThanksItem[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(items.slice(0, MAX_ITEMS)));
    try { window.dispatchEvent(new Event('axe-thinkthanks-changed')); } catch { /* */ }
    mirrorToCloud(items);
  } catch (e) {
    console.warn('[thinkthanks] persist failed', e);
  }
}

export function listThinkThanksItems(): ThinkThanksItem[] {
  return loadRaw().sort((a, b) => b.createdAt - a.createdAt);
}

export function listBuiltLibrary(): ThinkThanksItem[] {
  return listThinkThanksItems().filter(i => !!i.builtAt);
}

export function getThinkThanksItem(id: string): ThinkThanksItem | undefined {
  return loadRaw().find(i => i.id === id);
}

export function upsertThinkThanksItem(item: ThinkThanksItem): void {
  const items = loadRaw().filter(i => i.id !== item.id);
  items.unshift(item);
  saveRaw(items);
}

export function deleteThinkThanksItem(id: string): void {
  saveRaw(loadRaw().filter(i => i.id !== id));
  try { window.dispatchEvent(new Event('axe-thinkthanks-changed')); } catch { /* */ }
}

export function isInstagramUrl(text: string): boolean {
  return /instagram\.com|instagr\.am/i.test(text);
}

export function extractUrls(text: string): string[] {
  return text.match(/https?:\/\/[^\s<>"']+/gi) ?? [];
}

function kindFromAttachment(att: NormalizedAttachment): ThinkItemKind {
  if (att.kind === 'image') return 'image';
  if (att.kind === 'video') return 'video';
  if (att.kind === 'audio') return 'audio';
  if (att.kind === 'text' || att.kind === 'pdf' || (att as { kind: string }).kind === 'office') return 'file';
  return 'binary';
}

/**
 * Every provider that could answer, best first — not one.
 *
 * This returned a SINGLE slot and preferred 'google' ahead of everything else,
 * so a dead Gemini key meant ThinkThanks silently stopped using a model at all:
 * the catch below swapped in heuristicAnalysis(), which is a keyword guess, and
 * the drop still showed as "done". No error on screen, just quietly worse
 * answers — the failure mode that is hardest to notice and hardest to trust.
 *
 * cascadeAround keeps the same preference at the front (whatever is configured
 * as primary) and adds the rest behind it, with Ollama last and always present
 * because it needs no key and cannot be revoked.
 */
function analysisCascade(): KeySlot[] {
  const vs = useVoiceStore.getState();
  const prefer = ['google', 'openrouter', 'openai', 'xai', 'anthropic'];
  const configured = [vs.primarySlot, vs.fallback1Slot, vs.fallback2Slot, vs.fallback3Slot].filter(
    (s): s is KeySlot => !!s && (!!s.key || s.provider === 'ollama'),
  );
  const head = prefer.map(p => configured.find(x => x.provider === p)).find(Boolean) ?? null;
  return cascadeAround(head);
}

/**
 * Ask each provider in turn. Vision-capable ones get the image; the rest get
 * the text, because a model that cannot see is still better than no model.
 */
async function askAcross(
  slots: KeySlot[],
  system: string,
  user: string,
  dataUrl?: string,
): Promise<string> {
  let lastErr: unknown;
  for (const slot of slots) {
    try {
      return dataUrl
        ? await callVision(slot, system, user, dataUrl)
        : await callProvider(slot, [
            { role: 'system', content: system },
            { role: 'user', content: user },
          ]);
    } catch (e) {
      lastErr = e;
    }
  }
  throw lastErr ?? new Error('no provider configured');
}

function baseFits(item: ThinkThanksItem): AppFitScore[] {
  const isMedia = item.kind === 'image' || item.kind === 'video' || item.kind === 'instagram-reel';
  const blob = `${item.name} ${item.textExcerpt ?? ''} ${item.sourceText ?? ''} ${item.url ?? ''}`.toLowerCase();
  const looksTrading = /trade|chart|forex|mt5|metaapi|order\s*block|scalp|pnl|broker|autonomous\s*trading/.test(blob);
  const looksApiHub = /api|model|flux|kling|veo|image\s*generat|video\s*generat|muapi|runway|luma/.test(blob);
  const looksMemory = /memory|note|rag|context|sync|universal\s*memory|axon/.test(blob);

  return TARGET_APPS.map(app => {
    let percent = isMedia ? 35 : 25;
    let reason = 'Generic drop — needs visual/content analysis.';
    if (app.id === 'axon-memory') {
      if (looksTrading) { percent = 8; reason = 'AXON is universal memory across apps, not trading agents or execution.'; }
      else if (looksMemory) { percent = 78; reason = 'Fits cross-app recall — store context once, reuse everywhere.'; }
      else if (looksApiHub) { percent = 22; reason = 'Could store API prefs metadata; product surface is elsewhere.'; }
      else { percent = 30; reason = 'Only if the idea is shared context, notes, or never re-explaining yourself.'; }
    } else if (app.id === 'trading-os' || app.id === 'axe-companion') {
      if (looksTrading) { percent = 82; reason = 'Trading surface — charts, agents, or market UX.'; }
      else if (looksApiHub) { percent = 40; reason = 'Media/API tools may help research visuals, not core execution.'; }
      else { percent = isMedia ? 28 : 22; reason = 'Only if the idea clearly improves trading UX or intel.'; }
    } else if (app.id === 'axe-core') {
      if (looksApiHub) { percent = 75; reason = 'HQ is the right place for multi-model APIs and orchestration.'; }
      else if (looksTrading) { percent = 55; reason = 'Core can host modules; Companion/Trading OS own day-to-day trading.'; }
      else { percent = isMedia ? 48 : 40; reason = 'Default home for product ideas, tools, and architecture.'; }
    }
    return { app: app.id, percent, reason };
  }).sort((a, b) => b.percent - a.percent);
}

function contentBlob(item: ThinkThanksItem): string {
  return [
    item.name,
    item.url,
    item.sourceText,
    item.textExcerpt,
    item.enrichedText,
    // attachments optional on older items
    ...(((item as { attachments?: { name?: string }[] }).attachments) || []).map(a => a.name || ''),
  ]
    .filter(Boolean)
    .join('\n');
}

function firstSentences(text: string, max = 2): string {
  const cleaned = text.replace(/\s+/g, ' ').trim();
  if (!cleaned) return '';
  const parts = cleaned.split(/(?<=[.!?])\s+/).filter(Boolean);
  return parts.slice(0, max).join(' ').slice(0, 420);
}

function hostOf(url?: string): string {
  if (!url) return '';
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return '';
  }
}

function isGenericActionPlan(plan: ActionPlanStep[] | undefined): boolean {
  if (!plan || plan.length < 4) return true;
  const generic = /^(extract|fit|design|build|integrate|confirm|wire|implement)$/i;
  const genericDetail = /confirm capability|lock target apps|ui placement, data model|frontend \+ backend|navigation, memory/i;
  let hits = 0;
  for (const s of plan) {
    if (generic.test((s.phase || '').trim())) hits++;
    if (genericDetail.test(s.detail || '')) hits++;
  }
  return hits >= 3;
}

function heuristicAnalysis(item: ThinkThanksItem): ThinkThanksAnalysis {
  const fits = baseFits(item);
  const overall = Math.round(fits.reduce((s, f) => s + f.percent, 0) / fits.length);
  const blob = contentBlob(item);
  const host = hostOf(item.url);
  const titleBase = (item.name || '').replace(/\.[^.]+$/, '') || host || 'Dropped item';
  const snippet = firstSentences(item.enrichedText || item.textExcerpt || item.sourceText || '');
  const top = fits[0];
  const topLabel = TARGET_APPS.find(a => a.id === top?.app)?.label ?? top?.app ?? 'AXE Core';

  const whatItIs = snippet
    ? `${titleBase}: ${snippet}`
    : host
      ? `Content from ${host} (${item.kind}) — needs deeper model pass; surface signals only for now.`
      : `${titleBase} (${item.kind}) — limited text available; treat as a capability seed.`;

  const howToUse = top
    ? `Primary surface: ${topLabel} (${top.percent}%). Open the relevant panel and treat this as a product input: ${titleBase}.`
    : `Review in ThinkTank, lock target apps, then BUILD on a thinktank branch.`;

  const whyUseful = top?.reason
    || 'Potential product value depends on extracting a concrete capability from the drop.';

  const placementUi = top?.app === 'trading-os' || top?.app === 'axe-companion'
    ? `Trading desk / chart strip / companion panels — feature entry for "${titleBase}".`
    : top?.app === 'axon-memory'
      ? `Memory / Neural / notes surfaces — store structured recall for "${titleBase}".`
      : `AXE Core HQ — widget, Home path, or Settings/tools entry for "${titleBase}".`;

  const placementBackend = host
    ? `Ingest from ${host}; map claims in "${titleBase}" to services/agents; avoid hardcoding secrets.`
    : `Thin service or agent skill for "${titleBase}"; prefer existing gateways before new infra.`;

  const placementMemory = `Tag memory with [${item.kind}, ${top?.app || 'axe-core'}, ${titleBase.slice(0, 40)}] so chat + terrain can recall this drop.`;

  const actionPlan: ActionPlanStep[] = [
    { phase: `Research ${titleBase.slice(0, 28)}`, detail: snippet || host ? `Mine ${host || 'drop text'} for product claims and name the capability behind "${titleBase}".` : `Expand context for "${titleBase}" (URL scrape / vision) before coding.` },
    { phase: 'Capability brief', detail: `Write whatItIs/howToUse for "${titleBase}" in one screen so BUILD has a target, not a vibe.` },
    { phase: `UI in ${topLabel}`, detail: placementUi },
    { phase: 'Backend hooks', detail: placementBackend },
    { phase: 'Memory depth', detail: placementMemory },
    { phase: 'Smart notes / risks', detail: `Note dependencies, MVP cut, and what NOT to build for "${titleBase}".` },
    { phase: 'BUILD on thinktank branch', detail: `Implement only the MVP of "${titleBase}" on thinktank/${top?.app || 'axe-core'}/… then INTEGRATE + MERGE via AXE.` },
  ];

  return {
    title: titleBase,
    description: snippet || whatItIs.slice(0, 280),
    whatItIs,
    howToUse,
    whyUseful,
    howToMake: `MVP in ${topLabel}: smallest UI path + one backend hook for "${titleBase}", then harden.`,
    smartNotes: host
      ? `Source host ${host}. Prefer live enrichment before BUILD. Heuristic pass — re-run Analyse with a strong vision/LLM slot for full fidelity.`
      : `Heuristic pass only — re-run Analyse when a model slot is available for item-specific depth.`,
    placementUi,
    placementBackend,
    placementMemory,
    actionPlan,
    fits,
    overallUsefulness: overall,
    tags: [item.kind, top?.app || 'axe-core'].filter(Boolean),
    analysedAt: Date.now(),
  };
}

function parseAnalysisJson(raw: string): Partial<ThinkThanksAnalysis> | null {
  try {
    const cleaned = raw.replace(/```json\s*/gi, '').replace(/```/g, '').trim();
    const start = cleaned.indexOf('{');
    const end = cleaned.lastIndexOf('}');
    if (start < 0 || end < 0) return null;
    return JSON.parse(cleaned.slice(start, end + 1)) as Partial<ThinkThanksAnalysis>;
  } catch {
    return null;
  }
}

const SYSTEM_PROMPT = [
  'You are AXE THINKTHANKS — senior product researcher for four apps:',
  'axe-core (Jarvis HQ / Tauri desktop), axe-companion (trading desk), axon-memory (universal memory, NOT trading), trading-os (charts/execution).',
  '',
  'MISSION: Actually understand THIS drop. Never recycle a generic template.',
  '',
  'RESEARCH (mandatory):',
  '1) WHAT IT IS — name the product/feature/idea in concrete terms from the content (quote visible text, claims, URLs, file names).',
  '2) HOW WE USE IT — day-to-day workflow inside AXE for Luka.',
  '3) WHY USE IT — unique value vs what AXE already has; skip fluff.',
  '4) UI PLACEMENT — exact screens/tabs/panels/widgets (e.g. RightPanel, Home chat, Trading chart strip).',
  '5) BACKEND — APIs, agents, cron, git, Supabase tables, Tauri commands if any.',
  '6) MEMORY DEPTH — what must be remembered (core/RAG/global/Obsidian tags) so AXE gets smarter.',
  '7) SMART NOTES — non-obvious risks, dependencies, MVP vs later.',
  '',
  'ACTION PLAN RULES:',
  '- Minimum 6 steps. Each phase name MUST be unique and specific to THIS item (not "Extract","Fit","Design","Build","Integrate" alone).',
  '- Each detail MUST mention something from the drop (product name, claim, URL host, UI element, API).',
  '- If two different drops would produce the same actionPlan, you failed — rewrite until specific.',
  '',
  'FITS:',
  '- Score all four apps 0-100 with different reasons grounded in the drop.',
  '- AXON Memory low for pure trading bots; high for cross-app recall/notes.',
  '- overallUsefulness is not the average of fits — judge real product value for Luka.',
  '',
  'Respond ONLY with JSON (no markdown fences):',
  '{',
  '  "title": string, "description": string, "whatItIs": string, "howToUse": string,',
  '  "whyUseful": string, "howToMake": string, "smartNotes": string,',
  '  "placementUi": string, "placementBackend": string, "placementMemory": string,',
  '  "actionPlan": [{ "phase": string, "detail": string }],',
  '  "overallUsefulness": number, "tags": string[],',
  '  "fits": [{ "app": "axe-core"|"axe-companion"|"axon-memory"|"trading-os", "percent": number, "reason": string }]',
  '}',
].join('\n');

async function callVision(slot: KeySlot, system: string, userText: string, dataUrl: string): Promise<string> {
  const cfg = PROVIDERS.find(p => p.id === slot.provider);
  if (!cfg) {
    return callProvider(slot, [
      { role: 'system', content: system },
      { role: 'user', content: userText },
    ]);
  }
  const base = toProxied(slot.baseUrl || cfg.baseUrl);
  const model = slot.model || cfg.defaultModel;
  const signal = AbortSignal.timeout(45_000);
  const m = dataUrl.match(/^data:([^;]+);base64,(.+)$/);
  const mime = m?.[1] || 'image/jpeg';
  const b64 = m?.[2] || '';

  if (cfg.format === 'google') {
    const parts: Array<Record<string, unknown>> = [{ text: userText }];
    if (b64) parts.push({ inlineData: { mimeType: mime, data: b64 } });
    const r = await fetch(`${base}/v1beta/models/${model}:generateContent`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-goog-api-key': slot.key },
      signal,
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: system }] },
        contents: [{ role: 'user', parts }],
        generationConfig: { maxOutputTokens: 4096 },
      }),
    });
    if (!r.ok) {
      const e = await r.json().catch(() => ({}));
      throw new Error((e as { error?: { message?: string } }).error?.message || `HTTP ${r.status}`);
    }
    const d = await r.json();
    return sanitizeLlmText(d.candidates?.[0]?.content?.parts?.[0]?.text ?? '');
  }

  if (cfg.format === 'openai' || !cfg.format) {
    const chatPath = slot.provider === 'groq' ? `${base}/chat/completions` : `${base}/v1/chat/completions`;
    const userContent: Array<Record<string, unknown>> = [{ type: 'text', text: userText }];
    if (dataUrl) userContent.push({ type: 'image_url', image_url: { url: dataUrl } });
    const r = await fetch(chatPath, {
      method: 'POST',
      headers: {
        ...(slot.key ? { Authorization: `Bearer ${slot.key}` } : {}),
        'Content-Type': 'application/json',
      },
      signal,
      body: JSON.stringify({
        model,
        max_tokens: 4096,
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: userContent },
        ],
      }),
    });
    if (!r.ok) {
      const e = await r.json().catch(() => ({}));
      throw new Error((e as { error?: { message?: string } }).error?.message || `HTTP ${r.status}`);
    }
    const d = await r.json();
    return sanitizeLlmText(d.choices?.[0]?.message?.content ?? '');
  }

  return callProvider(slot, [
    { role: 'system', content: system },
    { role: 'user', content: `${userText}\n\n[Image present but provider format lacks vision in this path.]` },
  ]);
}

function mergeAnalysis(parsed: Partial<ThinkThanksAnalysis> | null, fallback: ThinkThanksAnalysis): ThinkThanksAnalysis {
  const fits =
    Array.isArray(parsed?.fits) && parsed!.fits!.length
      ? (parsed!.fits as AppFitScore[]).map(f => ({
          app: f.app,
          percent: Math.max(0, Math.min(100, Number(f.percent) || 0)),
          reason: String(f.reason || ''),
        }))
      : fallback.fits;
  for (const app of TARGET_APPS) {
    if (!fits.some(f => f.app === app.id)) {
      fits.push({ app: app.id, percent: 10, reason: 'Not scored by model — default low.' });
    }
  }
  fits.sort((a, b) => b.percent - a.percent);
  let actionPlan = fallback.actionPlan || [];
  if (Array.isArray(parsed?.actionPlan) && (parsed!.actionPlan as ActionPlanStep[]).length) {
    const candidate = (parsed!.actionPlan as ActionPlanStep[]).map(s => ({
      phase: String(s.phase || 'Step'),
      detail: String(s.detail || ''),
    }));
    // Reject cookie-cutter plans — keep heuristic content-specific plan instead
    actionPlan = isGenericActionPlan(candidate) ? (fallback.actionPlan || candidate) : candidate;
  }

  return {
    title: String(parsed?.title || fallback.title),
    description: String(parsed?.description || fallback.description),
    whatItIs: String(parsed?.whatItIs || fallback.whatItIs),
    howToUse: String(parsed?.howToUse || fallback.howToUse),
    whyUseful: String(parsed?.whyUseful || fallback.whyUseful),
    howToMake: String(parsed?.howToMake || fallback.howToMake),
    smartNotes: String(parsed?.smartNotes || fallback.smartNotes),
    placementUi: String(parsed?.placementUi || fallback.placementUi || ''),
    placementBackend: String(parsed?.placementBackend || fallback.placementBackend || ''),
    placementMemory: String(parsed?.placementMemory || fallback.placementMemory || ''),
    actionPlan,
    fits,
    overallUsefulness: Math.max(0, Math.min(100, Number(parsed?.overallUsefulness ?? fallback.overallUsefulness) || 0)),
    tags: Array.isArray(parsed?.tags) ? parsed!.tags!.map(String) : fallback.tags,
    analysedAt: Date.now(),
    enrichmentSummary: fallback.enrichmentSummary,
  };
}

export async function analyseThinkThanksItem(id: string): Promise<ThinkThanksItem> {
  let item = getThinkThanksItem(id);
  if (!item) throw new Error('Item not found');
  upsertThinkThanksItem({ ...item, analysisStatus: 'enriching', analysisError: undefined });

  const url = item.url || extractUrls(item.sourceText || item.textExcerpt || '')[0];
  const enrichNotes: string[] = [];
  if (url && !(item.enrichedText && item.enrichedText.length > 200)) {
    try {
      const { firecrawlScrape } = await import('@/infrastructure/gateways/firecrawlService');
      const fc = await firecrawlScrape(url);
      if (fc.ok && fc.markdown && fc.markdown.length > 80) {
        item = { ...item, enrichedText: fc.markdown.slice(0, 50_000), textExcerpt: item.textExcerpt || fc.markdown.slice(0, 8000) };
        enrichNotes.push('Firecrawl');
        upsertThinkThanksItem(item);
      } else if (fc.error) {
        enrichNotes.push(`Firecrawl: ${fc.error.slice(0, 60)}`);
      }
    } catch {
      enrichNotes.push('Firecrawl unavailable');
    }
    if (!(item.enrichedText && item.enrichedText.length > 200)) {
      try {
        const r = await fetch(`https://r.jina.ai/${url}`, { signal: AbortSignal.timeout(18_000), headers: { Accept: 'text/plain' } });
        if (r.ok) {
          const body = (await r.text()).slice(0, 40_000);
          if (body.length > 80) {
            item = { ...item, enrichedText: body, textExcerpt: item.textExcerpt || body.slice(0, 8000) };
            enrichNotes.push('Jina');
            upsertThinkThanksItem(item);
          }
        }
      } catch { /* continue */ }
    }
    try {
      const u = new URL(url);
      enrichNotes.push(`host:${u.hostname}`);
    } catch { /* */ }
  }
  if (item.previewUrl?.startsWith('data:')) enrichNotes.push('image-bytes');

  upsertThinkThanksItem({ ...item, analysisStatus: 'analysing' });

  const slots = analysisCascade();
  if (!slots.length) {
    const analysis = heuristicAnalysis(item);
    analysis.enrichmentSummary = enrichNotes.join(' · ') || analysis.enrichmentSummary;
    const done: ThinkThanksItem = { ...item, analysis, analysisStatus: 'done', lastReanalysedAt: Date.now() };
    upsertThinkThanksItem(done);
    return done;
  }

  const user = [
    'Analyse THIS drop only. Quote concrete details. Action plan must be unique to this content.',
    `Kind: ${item.kind}`,
    `Name: ${item.name}`,
    item.mime ? `MIME: ${item.mime}` : '',
    item.size != null ? `Size: ${formatSize(item.size)}` : '',
    item.url ? `URL: ${item.url}` : '',
    item.sourceText ? `Source / paste:\n${item.sourceText.slice(0, 6000)}` : '',
    item.enrichedText ? `Enriched content:\n${item.enrichedText.slice(0, 14000)}` : '',
    item.textExcerpt && item.textExcerpt !== item.enrichedText
      ? `Excerpt:\n${item.textExcerpt.slice(0, 6000)}`
      : '',
    ((item as { attachments?: { name?: string; kind?: string; mime?: string }[] }).attachments)?.length
      ? `Attachments: ${((item as { attachments?: { name?: string; kind?: string; mime?: string }[] }).attachments)!.map(a => `${a.name || a.kind} (${a.mime || ''})`).join(' · ')}`
      : '',
    item.previewUrl?.startsWith('data:')
      ? 'IMAGE ATTACHED — OCR every visible product name, claim, model list, button, UI structure. Base the action plan on what you read.'
      : 'No image bytes — mine URL + text for product value. Do not invent a different product.',
    'Forbidden generic phases: Extract, Fit, Design, Build, Integrate (as sole phase names).',
  ].filter(Boolean).join('\n');

  try {
    const isImage = !!item.previewUrl?.startsWith('data:') && (item.kind === 'image' || item.mime?.startsWith('image/'));
    const raw: string = await askAcross(slots, SYSTEM_PROMPT, user, isImage ? item.previewUrl : undefined);
    const fallback = heuristicAnalysis(item);
    fallback.enrichmentSummary = enrichNotes.join(' · ') || fallback.enrichmentSummary;
    let analysis = mergeAnalysis(parseAnalysisJson(raw), fallback);

    // One retry if the model returned a generic / empty plan
    if (isGenericActionPlan(analysis.actionPlan)) {
      try {
        const retryUser = user + '\n\nRETRY: Your previous actionPlan was too generic. Rewrite JSON with 6+ item-specific steps that quote this drop.';
        const raw2 = await askAcross(slots, SYSTEM_PROMPT, retryUser, isImage ? item.previewUrl : undefined);
        analysis = mergeAnalysis(parseAnalysisJson(raw2), fallback);
      } catch { /* keep first pass */ }
    }

    const done: ThinkThanksItem = { ...item, analysis, analysisStatus: 'done', lastReanalysedAt: Date.now() };
    upsertThinkThanksItem(done);
    return done;
  } catch (e) {
    const analysis = heuristicAnalysis(item);
    analysis.enrichmentSummary = enrichNotes.join(' · ') || analysis.enrichmentSummary;
    const err = e instanceof Error ? e.message : String(e);
    const done: ThinkThanksItem = { ...item, analysis, analysisStatus: 'done', analysisError: err, lastReanalysedAt: Date.now() };
    upsertThinkThanksItem(done);
    return done;
  }
}

export async function addFilesToThinkThanks(files: FileList | File[]): Promise<ThinkThanksItem[]> {
  const atts = await normalizeFiles(files, []);
  const created: ThinkThanksItem[] = [];
  for (const att of atts) {
    const item: ThinkThanksItem = {
      id: uid(),
      createdAt: Date.now(),
      kind: kindFromAttachment(att),
      name: att.name,
      mime: att.mime,
      size: att.size,
      previewUrl: att.previewUrl,
      textExcerpt: att.text,
      analysisStatus: 'pending',
    };
    upsertThinkThanksItem(item);
    created.push(item);
    void analyseThinkThanksItem(item.id);
  }
  return created;
}

export async function addTextOrLinkToThinkThanks(raw: string): Promise<ThinkThanksItem> {
  const text = raw.trim();
  if (!text) throw new Error('Empty input');
  const urls = extractUrls(text);
  const ig = urls.find(isInstagramUrl) || (isInstagramUrl(text) ? text : undefined);
  const item: ThinkThanksItem = {
    id: uid(),
    createdAt: Date.now(),
    kind: ig ? 'instagram-reel' : urls.length ? 'link' : 'note',
    name: ig ? 'Instagram link' : urls[0] || text.slice(0, 48) || 'Note',
    url: ig || urls[0],
    sourceText: text,
    textExcerpt: text.slice(0, 8000),
    analysisStatus: 'pending',
  };
  upsertThinkThanksItem(item);
  void analyseThinkThanksItem(item.id);
  return item;
}

export interface BuildOptions { apps: TargetApp[]; composerContext: string; }

/** Persist blueprint into every AXE memory surface so Neural / Map / Architecture / Library all see it. */
async function persistBlueprintToMemorySurfaces(
  item: ThinkThanksItem,
  analysis: ThinkThanksAnalysis,
  apps: TargetApp[],
  phase: 'build' | 'integrate',
  extraPlan?: ActionPlanStep[],
): Promise<{ globalMemory: boolean; rag: boolean; obsidian: boolean; notePath?: string }> {
  const appLabels = apps.map(a => TARGET_APPS.find(t => t.id === a)?.label ?? a).join(', ');
  const title = analysis.title || item.name;
  const status = { globalMemory: false, rag: false, obsidian: false, notePath: undefined as string | undefined };

  const body = [
    `# THINKTHANKS ${phase.toUpperCase()}: ${title}`,
    '',
    `**Source:** ${item.kind} · ${item.name}`,
    item.url ? `**URL:** ${item.url}` : '',
    `**Target apps:** ${appLabels}`,
    `**Overall usefulness:** ${analysis.overallUsefulness}%`,
    '',
    '## What it is',
    analysis.whatItIs || analysis.description,
    '',
    '## Why useful',
    analysis.whyUseful,
    '',
    '## How to use',
    analysis.howToUse,
    '',
    '## How to make',
    analysis.howToMake,
    '',
    '## Smart notes',
    analysis.smartNotes,
    '',
    '## UI placement',
    analysis.placementUi || '—',
    '',
    '## Backend',
    analysis.placementBackend || '—',
    '',
    '## Memory placement',
    analysis.placementMemory || '—',
    '',
    '## Action plan',
    ...((phase === 'integrate' && extraPlan?.length ? extraPlan : analysis.actionPlan) || []).map(
      (s, i) => `${i + 1}. **${s.phase}** — ${s.detail}`,
    ),
    '',
    '## App fit scores',
    ...analysis.fits.map(f => {
      const label = TARGET_APPS.find(t => t.id === f.app)?.label ?? f.app;
      return `- ${label}: ${f.percent}% — ${f.reason}`;
    }),
    '',
    `Tags: ${(analysis.tags || []).join(', ') || item.kind}`,
    `THINKTHANKS id: ${item.id}`,
  ].filter(Boolean).join('\n');

  // Global memory (durable brain — shows in Neural terrain + memory stream)
  try {
    const { saveGlobalMemory } = await import('@/infrastructure/persistence/globalMemoryService');
    const { AXE_USER_ID } = await import('@/infrastructure/persistence/chatPersistence');
    await saveGlobalMemory({
      user_id: AXE_USER_ID,
      category: 'system_event',
      key: `thinkthanks_${phase}_${item.id}`,
      value: JSON.stringify({
        title,
        phase,
        apps,
        summary: analysis.whatItIs?.slice(0, 280) || analysis.description?.slice(0, 280),
        overallUsefulness: analysis.overallUsefulness,
        libraryCategory: item.libraryCategory,
        at: new Date().toISOString(),
      }),
      confidence: 0.92,
      metadata: {
        source: 'thinkthanks',
        agentId: 'thinktank_agent',
        phase,
        item_id: item.id,
        apps,
        title,
      },
    });
    status.globalMemory = true;
  } catch (e) {
    console.warn('[thinkthanks] global memory write failed', e);
    try {
      // local fallback so Neural still sees something if API is down
      const key = 'axe_global_memory_cache';
      const cached = JSON.parse(localStorage.getItem(key) || '[]');
      cached.push({
        id: `tt-${phase}-${item.id}`,
        user_id: 'local',
        category: 'system_event',
        key: `thinkthanks_${phase}_${item.id}`,
        value: `${title} — ${analysis.whatItIs?.slice(0, 200) || ''}`,
        confidence: 0.85,
        metadata: { source: 'thinkthanks', phase, item_id: item.id, apps },
        created_at: new Date().toISOString(),
      });
      localStorage.setItem(key, JSON.stringify(cached.slice(-200)));
      status.globalMemory = true;
    } catch { /* */ }
  }

  // RAG (semantic recall for agents + Memory Library shelves)
  try {
    const { saveRagMemory } = await import('@/infrastructure/persistence/ragMemoryService');
    await saveRagMemory({
      category: 'system',
      content: body.slice(0, 12000),
      importance: phase === 'integrate' ? 9 : 8,
      metadata: {
        source: 'thinkthanks',
        phase,
        item_id: item.id,
        apps,
        title,
        tags: analysis.tags || [],
      },
    });
    status.rag = true;
  } catch (e) {
    console.warn('[thinkthanks] RAG write failed', e);
  }

  // Obsidian note (graph + vault — visible in Memory Library / Obsidian shelf)
  try {
    const { writeObsidianNote, notePathFromTitle } = await import(
      '@/infrastructure/persistence/obsidianMemoryService'
    );
    const noteTitle = `THINKTHANKS ${phase === 'integrate' ? 'Integrated' : 'Built'} — ${title}`;
    const path = notePathFromTitle(noteTitle, 'AXE/ThinkThanks');
    const result = await writeObsidianNote({
      path,
      title: noteTitle,
      content: body + '\n\n[[THINKTHANKS]] [[AXE Core]]\n',
      tags: ['thinkthanks', phase, ...(analysis.tags || []).slice(0, 6), ...apps],
      source: 'axe',
      metadata: { item_id: item.id, phase, apps, builtAt: item.builtAt, integratedAt: item.integratedAt },
    });
    status.obsidian = true;
    status.notePath = result.path;
  } catch (e) {
    console.warn('[thinkthanks] Obsidian write failed', e);
  }

  // Append-only event stream (memory recorder → global_memory batch)
  try {
    const { recordEvent } = await import('@/infrastructure/persistence/memoryRecorder');
    recordEvent({
      kind: 'resource',
      summary: `THINKTHANKS ${phase}: ${title} → ${appLabels}`,
      details: { item_id: item.id, phase, apps, usefulness: analysis.overallUsefulness },
      confidence: 0.9,
      agentId: 'thinktank_agent',
    });
  } catch (e) {
    console.warn('[thinkthanks] memoryRecorder failed', e);
  }

  // Notify Neural / Memory Library / Architecture subscribers
  try {
    const { emitAxeEvent } = await import('@/infrastructure/events/eventBus');
    emitAxeEvent('axe:memory-changed', { kind: phase === 'integrate' ? 'memory' : 'obsidian' });
  } catch (e) {
    console.warn('[thinkthanks] emitAxeEvent failed', e);
  }

  return status;
}

function buildIntegrateActionPlan(item: ThinkThanksItem, analysis: ThinkThanksAnalysis): ActionPlanStep[] {
  const apps = item.builtApps || [];
  const appLabels = apps.map(a => TARGET_APPS.find(t => t.id === a)?.label ?? a).join(', ') || 'AXE Core';
  const top = analysis.fits?.[0];
  return [
    {
      phase: 'Verify blueprint',
      detail: `Confirm BUILD artifact for "${analysis.title}" is in Library and memory surfaces (RAG + Obsidian + global).`,
    },
    {
      phase: 'UI entry',
      detail: analysis.placementUi
        || `Add a reachable entry point in ${appLabels} (nav item, widget, or panel) using existing AXE HUD language.`,
    },
    {
      phase: 'Backend / gateways',
      detail: analysis.placementBackend
        || 'Wire required APIs through existing gateways; reuse keys already configured in AXE Core.',
    },
    {
      phase: 'Memory wiring',
      detail: analysis.placementMemory
        || 'Ensure agents can recall this capability via durable memory (already written on BUILD; refresh neural map).',
    },
    {
      phase: 'Architecture visibility',
      detail: `Surface "${analysis.title}" under Capabilities / Memory on the Architecture map for ${appLabels}.`,
    },
    {
      phase: 'Smoke-check',
      detail: top
        ? `Primary fit is ${TARGET_APPS.find(t => t.id === top.app)?.label ?? top.app} (${top.percent}%). Click through the live path and confirm no regressions.`
        : 'Click through the live path and confirm the feature is reachable end-to-end.',
    },
    {
      phase: 'Mark integrated',
      detail: 'Persist integratedAt + integrate plan; emit axe-thinkthanks-integrated so Home / Neural / Map refresh.',
    },
  ];
}



const CUSTOM_AGENTS_KEY = 'axe_custom_agents_v1';
const APP_GROWTH_KEY = 'axe_app_growth_v1';

export interface AppGrowthEntry {
  id: string;
  app: TargetApp;
  itemId: string;
  title: string;
  kind: 'agent' | 'capability' | 'feature' | 'code';
  agentId?: string;
  skillId?: string;
  capability?: string;
  at: number;
}

export function listAppGrowth(app?: TargetApp): AppGrowthEntry[] {
  try {
    const raw = localStorage.getItem(APP_GROWTH_KEY);
    const list = raw ? (JSON.parse(raw) as AppGrowthEntry[]) : [];
    if (!Array.isArray(list)) return [];
    return app ? list.filter(e => e.app === app) : list;
  } catch {
    return [];
  }
}

/** Per-app counts for Home / widgets. */
export function summarizeAppGrowth(): { app: TargetApp; label: string; color: string; count: number; recent: number }[] {
  const all = listAppGrowth();
  const hourAgo = Date.now() - 60 * 60 * 1000;
  return TARGET_APPS.map(t => {
    const rows = all.filter(e => e.app === t.id);
    return {
      app: t.id,
      label: t.label,
      color: t.color,
      count: rows.length,
      recent: rows.filter(e => e.at >= hourAgo).length,
    };
  });
}

function recordAppGrowth(entry: Omit<AppGrowthEntry, 'id' | 'at'>): AppGrowthEntry {
  const full: AppGrowthEntry = { ...entry, id: uid(), at: Date.now() };
  try {
    const prev = listAppGrowth();
    // de-dupe same itemId+app
    const next = [full, ...prev.filter(e => !(e.itemId === full.itemId && e.app === full.app))].slice(0, 200);
    localStorage.setItem(APP_GROWTH_KEY, JSON.stringify(next));
    try {
      window.dispatchEvent(new CustomEvent('axe-app-growth', { detail: full }));
    } catch { /* */ }
  } catch (e) {
    console.warn('[thinkthanks] recordAppGrowth failed', e);
  }
  return full;
}

/**
 * Resolve a usable workspace root for the code agent (folder that contains src/).
 *
 * Real bug this replaced: the old version only ever checked top-level workspace
 * entries (and one level under each), matching by exact name or endsWith — but
 * this repo's actual src/ lives THREE levels down
 * (AXE-CORE-/AXE-CORE-ORCHESTRATOR-content/AXE-CORE-HEADQUARTERS/src), one
 * level deeper than that search ever reached. "AXE-CORE-" (a genuine top-level
 * folder name) matched its own prefer-list entry first and returned
 * immediately, before the nested search ever ran. Confirmed live: a real BUILD
 * run resolved workspaceRoot="AXE-CORE-", the agent burned all 5 turns on
 * `ls`/`cd AXE-CORE-` (which 404s — exec always runs from WORKSPACE_DIR, a cd
 * into a path relative to itself doesn't reach anywhere useful) trying to
 * locate itself, and shipped zero patches.
 *
 * Fix: try the known-correct nested path directly first (this codebase's
 * layout is fixed, no need to discover it by trial and error), then fall back
 * to a real two-level-deep search if that path is ever missing.
 */
async function resolveWorkspaceRoot(): Promise<string> {
  try {
    const { listWorkspaceDirectory } = await import('@/infrastructure/persistence/workspaceFilesService');

    const knownRoots = [
      'AXE-CORE-/AXE-CORE-ORCHESTRATOR-content/AXE-CORE-HEADQUARTERS',
      'AXE-CORE-ORCHESTRATOR-content/AXE-CORE-HEADQUARTERS',
    ];
    for (const root of knownRoots) {
      try {
        const kids = await listWorkspaceDirectory(root);
        if (kids.some(k => (k.name || '') === 'src')) return root;
      } catch { /* not present under this root, try the next */ }
    }

    const roots = await listWorkspaceDirectory('');
    const names = roots.map(n => n.name || n.path || '').filter(Boolean);
    for (const n of roots) {
      const name = n.name || n.path;
      if (!name || n.type === 'file') continue;
      try {
        const kids = await listWorkspaceDirectory(name);
        if (kids.some(k => (k.name || '') === 'src')) return name;
        for (const k of kids) {
          const kName = k.name || k.path;
          if (!kName || k.type === 'file') continue;
          try {
            const grandkids = await listWorkspaceDirectory(`${name}/${kName}`);
            if (grandkids.some(g => (g.name || '') === 'src')) return `${name}/${kName}`;
          } catch { /* */ }
        }
      } catch { /* */ }
    }
    return names[0] || '';
  } catch {
    return '';
  }
}

function capabilityIdFromTitle(title: string): string {
  return (
    'tt-' +
    title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 36)
  ) || `tt-cap-${Date.now().toString(36)}`;
}

async function registerCapabilityForItem(
  item: ThinkThanksItem,
  analysis: ThinkThanksAnalysis,
  agentId?: string,
): Promise<string | undefined> {
  try {
    const { registerLocalCapability } = await import('@/infrastructure/persistence/capabilityService');
    const title = analysis.title || item.name;
    const capId = capabilityIdFromTitle(title);
    const keywords: string[] = [];
    const addKw = (k: string) => {
      const clean = k.toLowerCase().replace(/[^a-z0-9\- ]/g, '').trim();
      if (!clean) return;
      if (clean.includes(' ')) keywords.push(clean.split(/\s+/).join('.*'));
      else keywords.push('\\b' + clean + '\\b');
    };
    addKw(title);
    for (const t of analysis.tags || []) addKw(t);
    addKw('thinkthanks');
    for (const w of title.toLowerCase().split(/\s+/)) {
      if (w.length > 3) addKw(w);
    }

    registerLocalCapability({
      capability: capId,
      display_name: title.slice(0, 64),
      description: (analysis.whatItIs || analysis.description || '').slice(0, 280),
      preferred_agent: agentId || '',
      keyword_patterns: keywords,
    });
    return capId;
  } catch (e) {
    console.warn('[thinkthanks] registerCapabilityForItem failed', e);
    return undefined;
  }
}

const AGENT_OVERRIDES_KEY = 'axe_agent_center_overrides_v1';

function looksLikeAgentIdea(analysis: ThinkThanksAnalysis, item: ThinkThanksItem): boolean {
  const blob = [
    analysis.title,
    analysis.whatItIs,
    analysis.howToMake,
    analysis.description,
    ...(analysis.tags || []),
    item.name,
  ].join(' ').toLowerCase();
  return /\bagents?\b|\bcopilot\b|\bbot\b|\bworkforce\b|\borchestrator\b|\bspecialist\b|\brole\b.*\bprompt\b|\bassistant\b|\bworkflow\b|\bautomat|\bmonitor\b|\bscanner\b|\banalys/.test(blob);
}

function slugifyAgentId(title: string): string {
  const base = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40) || 'agent';
  return `tt-${base}-${Date.now().toString(36).slice(-4)}`;
}

function inferAgentRole(analysis: ThinkThanksAnalysis): string {
  const blob = `${analysis.title} ${analysis.whatItIs} ${analysis.tags?.join(' ')}`.toLowerCase();
  if (/trad|market|broker|forex|chart/.test(blob)) return 'trader';
  if (/code|dev|engineer|deploy|github/.test(blob)) return 'developer';
  if (/analy|research|intel|signal/.test(blob)) return 'analyst';
  if (/orchestr|router|hq|core/.test(blob)) return 'orchestrator';
  if (/privacy|local|ollama/.test(blob)) return 'privacy';
  return 'assistant';
}

/** Create a real Agent Center agent from a THINKTHANKS blueprint (AXE Core target). */
function materializeAgentFromBlueprint(
  item: ThinkThanksItem,
  analysis: ThinkThanksAnalysis,
  apps: TargetApp[],
): { kind: 'agent'; id: string; label: string; href: string } | null {
  const axeFit = analysis.fits?.find(f => f.app === 'axe-core')?.percent ?? 0;
  const isAgentLike = looksLikeAgentIdea(analysis, item) || (apps.includes('axe-core') && axeFit >= 55);
  if (!isAgentLike && !apps.includes('axe-core')) return null;
  if (!isAgentLike && !apps.includes('axe-companion') && !apps.includes('trading-os') && axeFit < 55) return null;

  const id = slugifyAgentId(analysis.title || item.name);
  const role = inferAgentRole(analysis);
  const display = (analysis.title || item.name).slice(0, 48);
  const systemPrompt = [
    `You are ${display} — an AXE agent created via THINKTHANKS.`,
    analysis.whatItIs || analysis.description,
    '',
    'How to operate:',
    analysis.howToUse || 'Follow the user request; use available tools and memory.',
    '',
    'Build notes:',
    analysis.howToMake || '',
    '',
    analysis.smartNotes ? `Notes: ${analysis.smartNotes}` : '',
    analysis.placementMemory ? `Memory: ${analysis.placementMemory}` : '',
  ].filter(Boolean).join('\n');

  const capabilities = (analysis.tags || [])
    .map(t => t.toLowerCase().replace(/\s+/g, '-'))
    .filter(Boolean)
    .slice(0, 8);

  const agent = {
    id,
    name: id,
    display_name: display,
    role,
    description: (analysis.whatItIs || analysis.description || 'THINKTHANKS agent').slice(0, 280),
    system_prompt: systemPrompt,
    memory_namespace: id,
    toolset: ['memory', 'tools'],
    model_provider: 'google',
    model_name: 'gemini-2.0-flash',
    status: 'standby' as string, // BUILD = created, INTEGRATE flips to active
    version: '1.0',
    capabilities: capabilities.length ? capabilities : ['thinkthanks'],
    supabase_tables: [] as string[],
    app_url: null as string | null,
    tags: ['thinkthanks', 'custom', ...(analysis.tags || []).slice(0, 4)],
  };

  try {
    const raw = localStorage.getItem(CUSTOM_AGENTS_KEY);
    const list: typeof agent[] = raw ? JSON.parse(raw) : [];
    const next = Array.isArray(list) ? list.filter(a => a.id !== id) : [];
    next.unshift(agent);
    localStorage.setItem(CUSTOM_AGENTS_KEY, JSON.stringify(next.slice(0, 80)));
  } catch (e) {
    console.warn('[thinkthanks] custom agents save failed', e);
  }

  // Also merge into Agent Center overrides so edits/status stick
  try {
    const ovRaw = localStorage.getItem(AGENT_OVERRIDES_KEY);
    const ov = ovRaw ? JSON.parse(ovRaw) : {};
    ov[id] = { ...(ov[id] || {}), ...agent };
    localStorage.setItem(AGENT_OVERRIDES_KEY, JSON.stringify(ov));
  } catch { /* */ }

  try {
    window.dispatchEvent(new CustomEvent('axe-agents-changed', { detail: { id, phase: 'build' } }));
  } catch { /* */ }

  return { kind: 'agent', id, label: display, href: `/agents?open=${encodeURIComponent(id)}` };
}

function activateLiveAgent(agentId: string): boolean {
  try {
    const raw = localStorage.getItem(CUSTOM_AGENTS_KEY);
    const list = raw ? JSON.parse(raw) : [];
    if (Array.isArray(list)) {
      const next = list.map((a: { id: string; status?: string }) =>
        a.id === agentId ? { ...a, status: 'active' } : a,
      );
      localStorage.setItem(CUSTOM_AGENTS_KEY, JSON.stringify(next));
    }
  } catch { /* */ }
  try {
    const ovRaw = localStorage.getItem(AGENT_OVERRIDES_KEY);
    const ov = ovRaw ? JSON.parse(ovRaw) : {};
    if (ov[agentId]) {
      ov[agentId] = { ...ov[agentId], status: 'active' };
      localStorage.setItem(AGENT_OVERRIDES_KEY, JSON.stringify(ov));
    }
  } catch { /* */ }
  try {
    window.dispatchEvent(new CustomEvent('axe-agents-changed', { detail: { id: agentId, phase: 'integrate' } }));
  } catch { /* */ }
  return true;
}


/** Same widening as analysisCascade: the four configured slots were the whole
 *  list here too, so BUILD had nowhere to go when the first key was dead. */
function pickSlots(): import('@/domain/providers').KeySlot[] {
  const vs = useVoiceStore.getState();
  return cascadeAround(vs.primarySlot ?? null);
}

/** Prefer code-capable models for magic BUILD (DeepSeek-Coder, Claude, GPT, Gemini, Grok, then rest). */
function pickCodeSlots(): import('@/domain/providers').KeySlot[] {
  const slots = pickSlots();
  const score = (s: import('@/domain/providers').KeySlot): number => {
    const m = (s.model || '').toLowerCase();
    const p = s.provider;
    if (p === 'ollama' && /deepseek|coder|codellama|qwen2\.5-coder/.test(m)) return 100;
    if (p === 'openrouter' && /coder|sonnet|gpt-4|claude/.test(m)) return 90;
    if (p === 'anthropic') return 88;
    if (p === 'openai') return 85;
    if (p === 'google') return 80;
    if (p === 'xai') return 78;
    if (p === 'ollama' && /llama3\.1|llama3|qwen|mistral|gemma/.test(m)) return 60;
    if (p === 'ollama') return 50;
    if (p === 'groq') return 55;
    return 40;
  };
  return [...slots].sort((a, b) => score(b) - score(a));
}

/** Non-agent ideas still become a discoverable capability + nav hook so the app grows. */
function materializeFeatureFromBlueprint(
  item: ThinkThanksItem,
  analysis: ThinkThanksAnalysis,
  apps: TargetApp[],
): { kind: 'capability'; id: string; label: string; href: string } | null {
  const title = (analysis.title || item.name || '').trim();
  if (!title) return null;
  const id = capabilityIdFromTitle(title);
  const label = title.slice(0, 48);

  // Prefer an existing tab that matches placement / tags
  const blob = `${analysis.placementUi || ''} ${analysis.tags?.join(' ') || ''} ${title}`.toLowerCase();
  let href = '/thinkthanks';
  if (/agent|workforce|bot/.test(blob)) href = '/agents';
  else if (/memory|obsidian|note|rag/.test(blob)) href = '/memory';
  else if (/trad|chart|market|broker/.test(blob)) href = '/trading';
  else if (/task|todo|cron|schedule/.test(blob)) href = '/tasks';
  else if (/code|editor|patch|repo/.test(blob)) href = '/code-editor';
  else if (/map|3d|terrain|neural/.test(blob)) href = '/maps-3d';
  else if (apps.includes('axe-core')) href = '/ai-core';

  try {
    // Dynamic nav so chat can resolve the feature name
    void import('@/domain/navRegistry').then(({ registerDynamicNavItem }) => {
      registerDynamicNavItem({
        path: href,
        label,
        keywords: [
          label.toLowerCase(),
          'thinkthanks',
          ...(analysis.tags || []).map(t => t.toLowerCase()),
        ].slice(0, 12),
      });
    }).catch(() => {});
  } catch { /* */ }

  return { kind: 'capability', id, label, href };
}

/** Create a durable skill from the blueprint so agents can execute the idea. */
async function materializeSkillFromBlueprint(
  item: ThinkThanksItem,
  analysis: ThinkThanksAnalysis,
): Promise<string | undefined> {
  try {
    const { addCustomSkill, setSkillsForAgent } = await import(
      '@/infrastructure/persistence/skillRegistryService'
    );
    const skill = await addCustomSkill({
      name: analysis.title || item.name,
      description: (analysis.whatItIs || analysis.description || '').slice(0, 240),
      instruction: [
        analysis.howToUse || '',
        analysis.howToMake || '',
        analysis.smartNotes || '',
        analysis.placementUi ? `UI: ${analysis.placementUi}` : '',
        analysis.placementBackend ? `Backend: ${analysis.placementBackend}` : '',
      ].filter(Boolean).join('\n\n'),
      category: 'custom',
    });
    // If we already have a live agent, attach the skill
    if (item.liveArtifact?.kind === 'agent' && item.liveArtifact.id) {
      try {
        const existing = await (await import('@/infrastructure/persistence/skillRegistryService')).getSkillsForAgent(
          item.liveArtifact.id,
        );
        await setSkillsForAgent(item.liveArtifact.id, [...new Set([...existing, skill.id])]);
      } catch { /* */ }
    }
    return skill.id;
  } catch (e) {
    console.warn('[thinkthanks] skill materialize failed', e);
    return undefined;
  }
}

/**
 * MAGIC CODING — run the AXE local code agent so BUILD actually patches the workspace.
 * Falls back to writing a generated feature module when the agent cannot run.
 */
async function runMagicCodeBuild(
  item: ThinkThanksItem,
  analysis: ThinkThanksAnalysis,
  apps: TargetApp[] | string[],
  composerContext: string,
): Promise<NonNullable<ThinkThanksItem['codeBuild']>> {
  const appLabels = (apps as string[]).map(a => TARGET_APPS.find(t => t.id === a)?.label ?? a).join(', ');
  const instruction = [
    `THINKTHANKS MAGIC BUILD — implement this feature end-to-end in the AXE Core HQ codebase.`,
    `Title: ${analysis.title}`,
    `Target apps: ${appLabels}`,
    '',
    '## What to build',
    analysis.whatItIs || analysis.description,
    '',
    '## How it should work',
    analysis.howToUse,
    '',
    '## Implementation guidance',
    analysis.howToMake,
    analysis.placementUi ? `UI placement: ${analysis.placementUi}` : '',
    analysis.placementBackend ? `Backend: ${analysis.placementBackend}` : '',
    analysis.placementMemory ? `Memory: ${analysis.placementMemory}` : '',
    '',
    '## Action plan',
    ...(analysis.actionPlan || []).map((s, i) => `${i + 1}. [${s.phase}] ${s.detail}`),
    '',
    composerContext.trim() ? `## Extra context from user\n${composerContext.trim()}` : '',
    '',
    '## Constraints',
    '- Prefer TypeScript/React under src/.',
    '- Reuse existing services, gateways, and UI patterns (cyan/cream HUD).',
    '- Wire navigation only if a new route is truly required.',
    '- Do not break existing tabs.',
    '- If this is an agent, ensure Agent Center registration is complete (system prompt + skills).',
    '- Apply real file patches; do not only describe the change.',
  ].filter(Boolean).join('\n');

  const filesTouched: string[] = [];
  const log: string[] = [];
  let patchesApplied = 0;
  let message = '';
  const pushLog = (line: string) => {
    log.push(line);
    try {
      const cur = getThinkThanksItem(item.id);
      if (cur?.codeBuild) {
        upsertThinkThanksItem({
          ...cur,
          codeBuild: {
            ...cur.codeBuild,
            status: 'running',
            message: line,
            patchesApplied,
            filesTouched: [...filesTouched],
            log: log.slice(-40),
            at: Date.now(),
          },
        });
      }
    } catch { /* */ }
  };

  // Always try to write a durable generated module the app can import later
  const genPath = `thinkthanks-generated/${(analysis.title || item.name)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .slice(0, 40) || item.id}.md`;
  try {
    const { writeWorkspaceFile, createWorkspaceEntry } = await import(
      '@/infrastructure/persistence/workspaceFilesService'
    );
    try { await createWorkspaceEntry('thinkthanks-generated', 'folder'); } catch { /* may exist */ }
    const doc = [
      `# ${analysis.title}`,
      '',
      `Generated by THINKTHANKS BUILD · ${new Date().toISOString()}`,
      `Item: ${item.id}`,
      `Apps: ${appLabels}`,
      '',
      analysis.whatItIs || analysis.description,
      '',
      '## How to use',
      analysis.howToUse,
      '',
      '## How to make',
      analysis.howToMake,
      '',
      '## Plan',
      ...(analysis.actionPlan || []).map(s => `- **${s.phase}**: ${s.detail}`),
    ].join('\n');
    await writeWorkspaceFile(genPath, doc);
    filesTouched.push(genPath);
    pushLog(`Wrote ${genPath}`);
  } catch (e) {
    console.warn('[thinkthanks] generated module write failed', e);
  }

  const codeSlots = pickCodeSlots();
  if (!codeSlots.length) {
    pushLog('No code-capable provider — skipping patch loop');
    return {
      status: 'skipped',
      message: 'No AI provider configured — blueprint + library + agent/skill only. Add Gemini, Grok, or Ollama (deepseek-coder) to enable magic coding patches.',
      patchesApplied: 0,
      filesTouched,
      log,
      at: Date.now(),
    };
  }

  try {
    const { runAgentLoop } = await import('@/application/agents/localCodeAgent');
    // Up to 3 passes — escalate until real patches land or we exhaust attempts
    for (let pass = 1; pass <= 3; pass++) {
      let passInstruction = instruction;
      if (pass === 2) {
        passInstruction = [
          instruction,
          '',
          '## RETRY — previous pass applied ZERO file patches.',
          'You MUST output at least one real search/replace patch against an existing file under src/.',
          'If unsure, extend an existing service or Agents registration rather than only describing the change.',
        ].join('\n');
      } else if (pass === 3) {
        passInstruction = [
          instruction,
          '',
          '## FINAL PASS — still zero patches. Minimum viable change required.',
          'Pick ONE concrete file that already exists (prefer Agents.tsx, thinkThanksService.ts, capabilityService.ts, or a page under src/presentation/pages/).',
          'Add a short comment block or small registration call that references this feature title.',
          'Output JSON with at least one patch: { search, replace, file } where search is exact existing text.',
          'Do not apologize. Do not only describe. Patch.',
        ].join('\n');
      }

      const workspaceRoot = await resolveWorkspaceRoot();
      if (pass === 1) pushLog(workspaceRoot ? `Workspace root: ${workspaceRoot}` : 'Workspace root: (empty — patches may be limited)');
      else pushLog(`Starting pass ${pass}…`);
      const turns = await runAgentLoop(passInstruction, null, codeSlots, {
        workspaceRoot,
        maxIterations: pass === 1 ? 5 : pass === 2 ? 4 : 3,
        onTurn: (turn) => {
          const n = turn.appliedPatches?.length || 0;
          patchesApplied += n;
          for (const patch of turn.appliedPatches || []) {
            if (patch.file && !filesTouched.includes(patch.file)) filesTouched.push(patch.file);
          }
          if (turn.message) message = turn.message;
          pushLog(
            `Pass ${pass} · turn ${turn.iteration ?? '?'}: ${n} patch(es)` +
              (turn.message ? ` — ${turn.message.slice(0, 120)}` : ''),
          );
        },
      });
      const last = turns[turns.length - 1];
      if (last?.message) message = last.message;
      if (patchesApplied > 0) break;
    }

    pushLog(patchesApplied > 0 ? `Done — ${patchesApplied} patch(es)` : 'FAILED — 0 patches');
    return {
      status: patchesApplied > 0 ? 'done' : 'failed',
      message:
        message ||
        (patchesApplied > 0
          ? `Applied ${patchesApplied} code patch(es) via magic BUILD.`
          : 'BUILD FAILED: 0 file patches. Check AI provider (Gemini/Grok/DeepSeek), workspace path, and GitHub token. Blueprint is saved but code was NOT written.'),
      patchesApplied,
      filesTouched,
      log,
      at: Date.now(),
    };
  } catch (e) {
    const err = e instanceof Error ? e.message : String(e);
    pushLog(`Error: ${err}`);
    return {
      status: 'error',
      message: `Code agent error: ${err}`,
      patchesApplied,
      filesTouched,
      log,
      at: Date.now(),
    };
  }
}

export async function buildThinkThanksItem(id: string, opts: BuildOptions): Promise<ThinkThanksItem> {
  const item = getThinkThanksItem(id);
  if (!item) throw new Error('Item not found');
  if (!opts.apps.length) throw new Error('Select at least one app');

  // ── HARD GATE: GitHub token + push per selected app ──────────────────
  const { checkAppsReadiness, publishThinkTankBranch } = await import(
    '@/infrastructure/persistence/thinkTankGit'
  );
  const { getRepoForApp } = await import('@/infrastructure/persistence/repoConfigService');
  const readiness = await checkAppsReadiness(opts.apps as string[]);
  if (!readiness.ok) {
    throw new Error(
      `BUILD geblokkeerd — GitHub niet klaar:\n${readiness.errors.join('\n')}\n→ Settings → Developer → Test connection`,
    );
  }

  const analysis = item.analysis ?? heuristicAnalysis(item);
  const appLabels = opts.apps.map(a => TARGET_APPS.find(t => t.id === a)?.label ?? a).join(', ');
  const category =
    analysis.tags?.[0] ||
    (opts.apps.includes('trading-os') ? 'Trading' : opts.apps.includes('axon-memory') ? 'Memory' : 'Product');

  const integratePlan = buildIntegrateActionPlan(
    { ...item, builtApps: opts.apps, libraryCategory: category },
    analysis,
  );

  const brief = [
    'THINKTHANKS BUILD REQUEST — implement this blueprint end-to-end.',
    `Title: ${analysis.title}`,
    `Source: ${item.kind} · ${item.name}`,
    item.url ? `URL: ${item.url}` : '',
    '## What it is', analysis.whatItIs || analysis.description,
    '## Why useful', analysis.whyUseful,
    '## How to use', analysis.howToUse,
    '## How to make', analysis.howToMake,
    '## Smart notes', analysis.smartNotes,
    '## UI placement', analysis.placementUi || '',
    '## Backend', analysis.placementBackend || '',
    '## Memory', analysis.placementMemory || '',
    '## Action plan',
    ...(analysis.actionPlan || []).map((s, i) => `${i + 1}. [${s.phase}] ${s.detail}`),
    `## Target apps\n${appLabels}`,
    '## Fits',
    ...analysis.fits.map(f => `- ${TARGET_APPS.find(t => t.id === f.app)?.label ?? f.app}: ${f.percent}% — ${f.reason}`),
    opts.composerContext.trim() ? `## Extra context\n${opts.composerContext.trim()}` : '',
    '## Job',
    'Implement for selected apps (frontend + backend + memory). After code lands, user will press INTEGRATE then MERGE via AXE.',
  ].filter(Boolean).join('\n');

  const librarySummary = [analysis.title, analysis.whatItIs.slice(0, 140), `Targets: ${appLabels}`].join(' — ');

  let updated: ThinkThanksItem = {
    ...item,
    analysis,
    builtAt: Date.now(),
    builtApps: opts.apps,
    buildResult: brief.slice(0, 6000),
    libraryCategory: category,
    librarySummary,
    integrateActionPlan: integratePlan,
    persistedTo: {
      library: true,
      globalMemory: false,
      rag: false,
      obsidian: false,
      chatBrief: false,
    },
  };
  upsertThinkThanksItem(updated);

  const persist = await persistBlueprintToMemorySurfaces(updated, analysis, opts.apps, 'build', integratePlan);
  let liveArtifact =
    materializeAgentFromBlueprint(updated, analysis, opts.apps) ||
    materializeFeatureFromBlueprint(updated, analysis, opts.apps) ||
    undefined;
  if (liveArtifact) {
    updated = { ...updated, liveArtifact };
    upsertThinkThanksItem(updated);
    try {
      const { registerDynamicNavItem } = await import('@/domain/navRegistry');
      registerDynamicNavItem({
        path: liveArtifact.href || '/thinkthanks',
        label: liveArtifact.label,
        keywords: [
          liveArtifact.label.toLowerCase(),
          'thinkthanks',
          ...(analysis.tags || []).map(t => t.toLowerCase()),
        ].slice(0, 12),
        recordType: liveArtifact.kind === 'agent' ? 'agent' : undefined,
      });
    } catch (e) {
      console.warn('[thinkthanks] dynamic nav register failed', e);
    }
  }

  const skillId = await materializeSkillFromBlueprint(updated, analysis);
  updated = {
    ...updated,
    codeBuild: {
      status: 'running',
      message: 'Magic coding in progress…',
      patchesApplied: 0,
      filesTouched: [],
      log: ['Starting magic BUILD…'],
      skillId,
      at: Date.now(),
    },
  };
  upsertThinkThanksItem(updated);
  try { window.dispatchEvent(new Event('axe-thinkthanks-changed')); } catch { /* */ }

  // Real workspace patches
  let codeBuild = await runMagicCodeBuild(updated, analysis, opts.apps, opts.composerContext);
  if (skillId) codeBuild.skillId = skillId;

  // HARD: 0 patches = failed (runMagicCodeBuild should already set this)
  if (codeBuild.patchesApplied === 0 && codeBuild.status === 'done') {
    codeBuild = {
      ...codeBuild,
      status: 'failed',
      message:
        codeBuild.message ||
        'BUILD FAILED: 0 file patches. Check AI provider + workspace. Blueprint saved but code was NOT written.',
    };
  }

  // Publish to thinktank/* branches on GitHub when we have real patches
  if (codeBuild.patchesApplied > 0 && (codeBuild.filesTouched?.length ?? 0) > 0) {
    const publishedApps: NonNullable<ThinkThanksItem['codeBuild']>['publishedApps'] = [];
    const { readWorkspaceFile } = await import('@/infrastructure/persistence/workspaceFilesService');

    for (const appId of opts.apps) {
      try {
        const repo = getRepoForApp(appId);
        const files: { path: string; content: string }[] = [];
        for (const rel of codeBuild.filesTouched) {
          try {
            const content = await readWorkspaceFile(rel);
            let repoPath = rel;
            if (repo?.id === 'axe-core' && repo.srcPrefix) {
              if (rel.startsWith('src/')) {
                // src/foo → <srcPrefix>/foo  (srcPrefix already ends with /src)
                const prefix = repo.srcPrefix.replace(/\/$/, '');
                repoPath = rel.startsWith('src/')
                  ? `${prefix}${rel.slice(3)}`
                  : `${prefix}/${rel}`;
              } else if (!rel.startsWith('thinkthanks-generated/')) {
                repoPath = rel;
              }
            }
            files.push({ path: repoPath, content });
          } catch (e) {
            console.warn('[thinkthanks] could not read workspace file for publish', rel, e);
          }
        }
        if (!files.length) continue;

        const pub = await publishThinkTankBranch({
          appId,
          itemId: id,
          itemTitle: analysis.title || item.name,
          files,
          summary: [
            analysis.whatItIs || analysis.description,
            '',
            `Patches: ${codeBuild.patchesApplied}`,
            `Files: ${codeBuild.filesTouched.join(', ')}`,
          ].join('\n'),
        });
        if (pub) {
          publishedApps.push({
            appId: pub.appId,
            branch: pub.branch,
            prUrl: pub.prUrl,
            prNumber: pub.prNumber,
            filesWritten: pub.filesWritten,
          });
          codeBuild.log = [
            ...(codeBuild.log || []),
            `Published ${pub.filesWritten.length} file(s) → ${pub.branch}`,
            `PR: ${pub.prUrl}`,
          ];
        }
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        console.warn('[thinkthanks] publish to GitHub failed for', appId, e);
        codeBuild.log = [...(codeBuild.log || []), `GitHub publish failed (${appId}): ${msg}`];
      }
    }

    if (publishedApps.length) {
      codeBuild.publishedApps = publishedApps;
      codeBuild.branch = publishedApps[0].branch;
      codeBuild.prUrl = publishedApps[0].prUrl;
      codeBuild.prNumber = publishedApps[0].prNumber;
      codeBuild.message = `${codeBuild.message} · ${publishedApps.length} PR(s) opened`;
      try {
        const { rememberAction } = await import('@/infrastructure/persistence/continuousMemoryService');
        rememberAction({
          kind: 'agent_run',
          summary: `ThinkTank BUILD: ${item.analysis?.title || item.name || item.id} · ${publishedApps.length} PR(s) on thinktank branches`,
          details: {
            id: item.id,
            branches: publishedApps.map(p => p.branch),
            prs: publishedApps.map(p => p.prNumber),
            patches: codeBuild.patchesApplied,
          },
          importance: 8,
        });
      } catch { /* */ }
    } else if (codeBuild.patchesApplied > 0) {
      // Patches on workspace but GitHub publish failed — still mark partial success
      codeBuild.log = [
        ...(codeBuild.log || []),
        'Workspace patches applied but no GitHub PR was created — check token/push rights.',
      ];
    }
  }

  if (liveArtifact?.kind === 'agent' && codeBuild.skillId) {
    try {
      const { setSkillsForAgent, getSkillsForAgent } = await import(
        '@/infrastructure/persistence/skillRegistryService'
      );
      const existing = await getSkillsForAgent(liveArtifact.id);
      await setSkillsForAgent(liveArtifact.id, [...new Set([...existing, codeBuild.skillId])]);
    } catch { /* */ }
  }

  updated = {
    ...updated,
    liveArtifact,
    libraryNotePath: persist.notePath || updated.libraryNotePath,
    persistedTo: {
      library: true,
      globalMemory: !!persist.globalMemory,
      rag: !!persist.rag,
      obsidian: !!persist.obsidian,
      chatBrief: false,
    },
    codeBuild,
  };
  upsertThinkThanksItem(updated);

  try {
    window.dispatchEvent(new CustomEvent('axe-thinkthanks-built', {
      detail: { id, apps: opts.apps, title: analysis.title, codeBuild },
    }));
    window.dispatchEvent(new Event('axe-thinkthanks-changed'));
    window.dispatchEvent(new Event('axe-memory-changed'));
  } catch { /* */ }

  return updated;
}

export function topFit(item: ThinkThanksItem): AppFitScore | null {
  const fits = item.analysis?.fits;
  if (!fits?.length) return null;
  return [...fits].sort((a, b) => b.percent - a.percent)[0] ?? null;
}

const MERGES_KEY = 'axe_thinkthanks_merges_v1';
const SCHED_KEY = 'axe_thinkthanks_last_batch_v1';

export function listMergeSuggestions(): MergeSuggestion[] {
  try {
    const raw = localStorage.getItem(MERGES_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as MergeSuggestion[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function computeMergeSuggestions(): MergeSuggestion[] {
  const items = listThinkThanksItems().filter(i => i.analysisStatus === 'done' && i.analysis);
  const out: MergeSuggestion[] = [];
  for (let i = 0; i < items.length; i++) {
    for (let j = i + 1; j < items.length; j++) {
      const a = items[i];
      const b = items[j];
      const tagsA = new Set((a.analysis!.tags || []).map(t => t.toLowerCase()));
      const tagsB = (b.analysis!.tags || []).map(t => t.toLowerCase());
      const overlap = tagsB.filter(t => tagsA.has(t) || [...tagsA].some(x => t.includes(x) || x.includes(t)));
      const pa = a.analysis!.overallUsefulness;
      const pb = b.analysis!.overallUsefulness;
      if (overlap.length && pa < 85 && pb < 85 && (pa + pb) / 2 >= 40) {
        const ta = topFit(a);
        const tb = topFit(b);
        const best = (ta?.percent ?? 0) >= (tb?.percent ?? 0) ? ta! : tb!;
        if (!best) continue;
        out.push({
          id: uid(),
          itemIds: [a.id, b.id],
          titles: [a.analysis!.title, b.analysis!.title],
          reason: `Shared themes (${overlap.slice(0, 3).join(', ')}) — combining may raise fit on ${TARGET_APPS.find(t => t.id === best.app)?.label}.`,
          projectedPercent: Math.min(95, Math.round((pa + pb) / 2 + 15 + overlap.length * 5)),
          bestApp: best.app,
          createdAt: Date.now(),
        });
      }
      if (out.length >= 12) break;
    }
    if (out.length >= 12) break;
  }
  try {
    localStorage.setItem(MERGES_KEY, JSON.stringify(out.slice(0, 40)));
  } catch { /* */ }
  return out;
}

export async function integrateThinkThanksItem(id: string): Promise<ThinkThanksItem> {
  const item = getThinkThanksItem(id);
  if (!item?.builtAt) throw new Error('Build this item first');
  const analysis = item.analysis ?? heuristicAnalysis(item);
  const apps = item.builtApps || [];
  const appLabels = apps.map(a => TARGET_APPS.find(t => t.id === a)?.label ?? a).join(', ') || 'AXE Core';

  const integratePlan = item.integrateActionPlan?.length
    ? item.integrateActionPlan
    : buildIntegrateActionPlan(item, analysis);

  let updated: ThinkThanksItem = {
    ...item,
    analysis,
    integrateActionPlan: integratePlan,
    integrateResult: [
      'THINKTHANKS INTEGRATE',
      `Title: ${analysis.title}`,
      `Apps: ${appLabels}`,
      item.codeBuild?.branch ? `Branch: ${item.codeBuild.branch}` : '',
      item.codeBuild?.prUrl ? `PR: ${item.codeBuild.prUrl}` : '',
      ...integratePlan.map((s, i) => `${i + 1}. [${s.phase}] ${s.detail}`),
    ].filter(Boolean).join('\n').slice(0, 6000),
    integratedAt: Date.now(),
  };
  upsertThinkThanksItem(updated);

  const persist = await persistBlueprintToMemorySurfaces(updated, analysis, apps, 'integrate', integratePlan);

  let liveArtifact = item.liveArtifact;
  if (liveArtifact?.kind === 'agent' && liveArtifact.id) {
    activateLiveAgent(liveArtifact.id);
  } else {
    const created =
      materializeAgentFromBlueprint(updated, analysis, apps) ||
      materializeFeatureFromBlueprint(updated, analysis, apps);
    if (created) {
      if (created.kind === 'agent') activateLiveAgent(created.id);
      liveArtifact = created;
    }
  }

  if (item.codeBuild?.skillId && liveArtifact?.kind === 'agent') {
    try {
      const { setSkillsForAgent, getSkillsForAgent } = await import(
        '@/infrastructure/persistence/skillRegistryService'
      );
      const existing = await getSkillsForAgent(liveArtifact.id);
      await setSkillsForAgent(liveArtifact.id, [...new Set([...existing, item.codeBuild.skillId])]);
    } catch { /* */ }
  }

  // ── HARD remote checks ───────────────────────────────────────────────
  const {
    evaluateIntegrateHardChecks,
    verifyThinkTankBranchOnRemote,
  } = await import('@/infrastructure/persistence/thinkTankGit');

  let branchExistsOnRemote: boolean | undefined;
  let filesOnBranch: number | undefined;
  if (item.codeBuild?.branch && apps[0]) {
    const remote = await verifyThinkTankBranchOnRemote({
      appId: apps[0],
      branch: item.codeBuild.branch,
    });
    branchExistsOnRemote = remote.exists;
    filesOnBranch = remote.filesOnBranch;
  }

  const hard = evaluateIntegrateHardChecks({
    patchesApplied: item.codeBuild?.patchesApplied ?? 0,
    branch: item.codeBuild?.branch,
    prUrl: item.codeBuild?.prUrl,
    filesTouched: item.codeBuild?.filesTouched,
    branchExistsOnRemote,
    filesOnBranch,
  });

  const checks: { name: string; pass: boolean; detail: string }[] = [
    {
      name: 'Library',
      pass: !!updated.builtAt,
      detail: updated.builtAt ? 'Blueprint in Library' : 'Missing builtAt',
    },
    {
      name: 'Memory',
      pass: !!persist.globalMemory || !!persist.rag || !!item.persistedTo?.globalMemory,
      detail: 'Global/RAG memory',
    },
    {
      name: 'Obsidian',
      pass: !!persist.obsidian || !!item.libraryNotePath || !!persist.notePath,
      detail: persist.notePath || item.libraryNotePath || 'No note',
    },
  ];

  for (const h of hard) {
    checks.push({
      name: h.name,
      pass: h.pass,
      detail: `${h.severity === 'hard' ? '[HARD] ' : ''}${h.detail}`,
    });
  }

  if (liveArtifact?.kind === 'agent') {
    try {
      activateLiveAgent(liveArtifact.id);
      const raw = localStorage.getItem('axe_custom_agents_v1');
      const list = raw ? JSON.parse(raw) : [];
      const found = Array.isArray(list)
        ? list.find((a: { id: string; status?: string }) => a.id === liveArtifact!.id)
        : null;
      const agentLive = !!found && found.status === 'active';
      checks.push({
        name: 'Agent Center',
        pass: agentLive,
        detail: agentLive ? `${liveArtifact.label} active` : `${liveArtifact.label} not active`,
      });
      await registerCapabilityForItem(updated, analysis, liveArtifact.id);
      checks.push({ name: 'Chat routing', pass: true, detail: 'Capability registered' });
    } catch (e) {
      checks.push({
        name: 'Agent Center',
        pass: false,
        detail: e instanceof Error ? e.message : 'agent check failed',
      });
    }
  }

  for (const app of apps) {
    recordAppGrowth({
      app,
      itemId: id,
      title: analysis.title || item.name,
      kind: liveArtifact?.kind === 'agent' ? 'agent' : 'feature',
      agentId: liveArtifact?.kind === 'agent' ? liveArtifact.id : undefined,
      skillId: item.codeBuild?.skillId,
    });
  }

  const hardFailed = hard.some(h => h.severity === 'hard' && !h.pass);
  const smokeCheck = {
    ok: !hardFailed && checks.every(c => c.pass),
    checks,
    at: Date.now(),
  };

  updated = {
    ...updated,
    liveArtifact,
    libraryNotePath: persist.notePath || item.libraryNotePath,
    persistedTo: {
      library: true,
      globalMemory: !!(item.persistedTo?.globalMemory || persist.globalMemory),
      rag: !!(item.persistedTo?.rag || persist.rag),
      obsidian: !!(item.persistedTo?.obsidian || persist.obsidian),
      chatBrief: false,
    },
    smokeCheck,
  };
  upsertThinkThanksItem(updated);

  try {
    window.dispatchEvent(new CustomEvent('axe-thinkthanks-integrated', { detail: { id, smokeCheck } }));
    window.dispatchEvent(new Event('axe-thinkthanks-changed'));
  } catch { /* */ }

  try {
    const { rememberAction } = await import('@/infrastructure/persistence/continuousMemoryService');
    rememberAction({
      kind: 'agent_run',
      summary: `ThinkTank INTEGRATE: ${updated.analysis?.title || updated.name || id}${smokeCheck && !smokeCheck.ok ? ' (smoke issues)' : ''}`,
      // builtApps, not targetApps -- the latter has never been a field on
      // ThinkThanksItem, so every INTEGRATE this app has ever recorded
      // stored `apps: undefined`. Every other reader uses builtApps.
      details: { id, smokeCheck, apps: updated.builtApps || [] },
      importance: smokeCheck && !smokeCheck.ok ? 6 : 7,
    });
  } catch { /* */ }

  return updated;
}

/**
 * Merge ThinkTank PRs into each app's base branch.
 * MUST be called only after explicit user confirmation in the UI.
 * After merge, code is on orchestrator/main — deploy/pull to see it live.
 */

export async function runScheduledReanalysis(force = false): Promise<{ analysed: number; merges: number }> {
  const last = Number(localStorage.getItem(SCHED_KEY) || 0);
  const twelveH = 12 * 60 * 60 * 1000;
  if (!force && Date.now() - last < twelveH) {
    return { analysed: 0, merges: listMergeSuggestions().length };
  }
  const items = listThinkThanksItems().slice(0, 25);
  let analysed = 0;
  for (const it of items) {
    try {
      await analyseThinkThanksItem(it.id);
      analysed++;
    } catch { /* continue */ }
  }
  const merges = computeMergeSuggestions();
  localStorage.setItem(SCHED_KEY, String(Date.now()));
  return { analysed, merges: merges.length };
}

export function usefulnessColor(pct: number): string {
  if (pct >= 75) return '#34d399';
  if (pct >= 50) return '#22d3ee';
  if (pct >= 30) return '#f59e0b';
  return '#f87171';
}

export function usefulnessLabel(pct: number): string {
  if (pct >= 75) return 'Highly useful';
  if (pct >= 50) return 'Useful';
  if (pct >= 30) return 'Maybe useful';
  return 'Low fit';
}


/**
 * Auto-repair a built/integrated item that failed smoke or never got patches.
 * Re-registers capability/nav, re-activates agent, optionally re-runs magic code once.
 */
export async function mergeThinkTankItem(id: string): Promise<ThinkThanksItem> {
  const item = getThinkThanksItem(id);
  if (!item?.codeBuild) throw new Error('Geen BUILD-resultaat — build eerst');
  if ((item.codeBuild.patchesApplied ?? 0) === 0) {
    throw new Error('0 patches — niets om te mergen');
  }

  const published = item.codeBuild.publishedApps?.length
    ? item.codeBuild.publishedApps
    : item.codeBuild.prNumber && item.codeBuild.branch
      ? [{
          appId: (item.builtApps?.[0] as string) || 'axe-core',
          branch: item.codeBuild.branch,
          prUrl: item.codeBuild.prUrl || '',
          prNumber: item.codeBuild.prNumber,
          filesWritten: item.codeBuild.filesTouched || [],
        }]
      : [];

  if (!published.length) {
    throw new Error('No PR found — BUILD must publish a thinktank branch + PR first');
  }

  const { mergeThinkTankPullRequest } = await import('@/infrastructure/persistence/thinkTankGit');
  const mergeResults: NonNullable<ThinkThanksItem['codeBuild']>['mergeResults'] = [];

  for (const pub of published) {
    if (!pub.prNumber) {
      mergeResults.push({
        appId: pub.appId,
        merged: false,
        message: 'Geen PR-nummer',
        prNumber: 0,
      });
      continue;
    }
    try {
      const r = await mergeThinkTankPullRequest({
        appId: pub.appId,
        prNumber: pub.prNumber,
        method: 'squash',
      });
      mergeResults.push({
        appId: r.appId,
        merged: r.merged,
        message: r.message,
        prNumber: r.prNumber,
      });
    } catch (e) {
      mergeResults.push({
        appId: pub.appId,
        merged: false,
        message: e instanceof Error ? e.message : String(e),
        prNumber: pub.prNumber,
      });
    }
  }

  const anyMerged = mergeResults.some(r => r.merged);
  const updated: ThinkThanksItem = {
    ...item,
    codeBuild: {
      ...item.codeBuild,
      mergedAt: anyMerged ? Date.now() : item.codeBuild.mergedAt,
      mergeResults,
      message: anyMerged
        ? `Merged: ${mergeResults.filter(r => r.merged).map(r => `${r.appId}#${r.prNumber}`).join(', ')}`
        : `Merge failed: ${mergeResults.map(r => r.message).join('; ')}`,
      log: [
        ...(item.codeBuild.log || []),
        ...mergeResults.map(r =>
          r.merged
            ? `MERGED ${r.appId} PR #${r.prNumber}`
            : `MERGE FAIL ${r.appId}: ${r.message}`,
        ),
      ],
    },
  };
  upsertThinkThanksItem(updated);

  try {
    window.dispatchEvent(new CustomEvent('axe-thinkthanks-merged', {
      detail: { id, mergeResults },
    }));
    window.dispatchEvent(new Event('axe-thinkthanks-changed'));
  } catch { /* */ }

  try {
    const { rememberAction } = await import('@/infrastructure/persistence/continuousMemoryService');
    const ok = mergeResults.filter((r: { merged: boolean }) => r.merged);
    const fail = mergeResults.filter((r: { merged: boolean }) => !r.merged);
    if (ok.length) {
      rememberAction({
        kind: 'agent_run',
        summary: `ThinkTank MERGE: ${item.analysis?.title || item.name || id} → ${ok.map((r: { appId: string }) => r.appId).join(',')}`,
        details: { id, mergeResults },
        importance: 8,
      });
    }
    if (fail.length) {
      rememberAction({
        kind: 'error',
        summary: `ThinkTank MERGE failed: ${fail.map((r: { message: string }) => r.message).join('; ')}`,
        details: { id, mergeResults },
        importance: 7,
      });
    }
  } catch { /* */ }

  return updated;
}

export async function repairThinkThanksItem(
  id: string,
  opts?: { rerunCode?: boolean },
): Promise<ThinkThanksItem | null> {
  const item = getThinkThanksItem(id);
  if (!item?.analysis) return null;
  const analysis = item.analysis;
  const apps = (item.builtApps?.length ? item.builtApps : ['axe-core']) as TargetApp[];

  let liveArtifact = item.liveArtifact;
  if (liveArtifact?.kind === 'agent' && liveArtifact.id) {
    activateLiveAgent(liveArtifact.id);
  } else {
    liveArtifact =
      materializeAgentFromBlueprint(item, analysis, apps) ||
      materializeFeatureFromBlueprint(item, analysis, apps) ||
      liveArtifact;
    if (liveArtifact?.kind === 'agent') activateLiveAgent(liveArtifact.id);
  }

  const skillId =
    item.codeBuild?.skillId ||
    (await materializeSkillFromBlueprint({ ...item, liveArtifact }, analysis));
  await registerCapabilityForItem({ ...item, liveArtifact }, analysis, liveArtifact?.kind === 'agent' ? liveArtifact.id : undefined);

  try {
    const { registerDynamicNavItem } = await import('@/domain/navRegistry');
    if (liveArtifact) {
      registerDynamicNavItem({
        path: liveArtifact.href || '/thinkthanks',
        label: liveArtifact.label,
        keywords: [liveArtifact.label.toLowerCase(), 'thinkthanks'],
        recordType: liveArtifact.kind === 'agent' ? 'agent' : undefined,
      });
    }
  } catch { /* */ }

  let codeBuild = item.codeBuild;
  if (opts?.rerunCode || (codeBuild && codeBuild.patchesApplied === 0 && codeBuild.status !== 'skipped')) {
    codeBuild = await runMagicCodeBuild({ ...item, liveArtifact }, analysis, apps, '');
  }

  for (const app of apps) {
    recordAppGrowth({
      app,
      itemId: id,
      title: analysis.title || item.name,
      kind: liveArtifact?.kind === 'agent' ? 'agent' : 'feature',
      agentId: liveArtifact?.kind === 'agent' ? liveArtifact.id : undefined,
      skillId,
      capability: liveArtifact?.id,
    });
  }

  const updated: ThinkThanksItem = {
    ...item,
    liveArtifact,
    codeBuild: codeBuild ? { ...codeBuild, skillId: skillId || codeBuild.skillId } : item.codeBuild,
  };
  upsertThinkThanksItem(updated);
  try {
    window.dispatchEvent(new CustomEvent('axe-thinkthanks-repaired', { detail: { id, liveArtifact } }));
    window.dispatchEvent(new Event('axe-thinkthanks-changed'));
  } catch { /* */ }
  return updated;
}

/** Repair all integrated items whose last smokeCheck failed (or never passed). */
export async function repairFailedIntegrations(): Promise<{ repaired: number }> {
  const items = listThinkThanksItems().filter(
    i => i.builtAt && (!i.smokeCheck || !i.smokeCheck.ok),
  );
  let repaired = 0;
  for (const it of items.slice(0, 8)) {
    try {
      await repairThinkThanksItem(it.id, { rerunCode: false });
      repaired++;
    } catch (e) {
      console.warn('[thinkthanks] repair failed', it.id, e);
    }
  }
  return { repaired };
}
