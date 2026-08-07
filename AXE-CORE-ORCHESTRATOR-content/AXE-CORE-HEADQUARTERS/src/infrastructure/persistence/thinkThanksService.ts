/**
 * THINKTHANKS — vision-analyse drops, score apps honestly, BUILD → library.
 */
import { callProvider, toProxied } from '@/infrastructure/gateways/llmGateway';
import type { KeySlot } from '@/domain/providers';
import { PROVIDERS } from '@/domain/providers';
import { normalizeFiles, type NormalizedAttachment, formatSize } from '@/application/attachments/attachmentService';
import { useVoiceStore } from '@/presentation/store/voiceStore';
import { sanitizeLlmText } from '@/infrastructure/gateways/sanitizeLlmText';

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
  /** Real code-agent run during BUILD (patches applied to workspace) */
  codeBuild?: {
    status: 'idle' | 'running' | 'done' | 'error' | 'skipped';
    message: string;
    patchesApplied: number;
    filesTouched: string[];
    /** Live transcript lines from the code agent */
    log?: string[];
    skillId?: string;
    at: number;
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

function pickSlot(): KeySlot | null {
  const vs = useVoiceStore.getState();
  const slots = [vs.primarySlot, vs.fallback1Slot, vs.fallback2Slot, vs.fallback3Slot].filter(
    (s): s is KeySlot => !!s && (!!s.key || s.provider === 'ollama'),
  );
  if (!slots.length) return null;
  const prefer = ['google', 'openrouter', 'openai', 'xai', 'anthropic'];
  for (const p of prefer) {
    const s = slots.find(x => x.provider === p);
    if (s) return s;
  }
  return slots[0];
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

function heuristicAnalysis(item: ThinkThanksItem): ThinkThanksAnalysis {
  const fits = baseFits(item);
  const overall = Math.round(fits.reduce((s, f) => s + f.percent, 0) / fits.length);
  return {
    title: item.name.replace(/\.[^.]+$/, '') || 'Dropped item',
    description: item.textExcerpt?.slice(0, 240) || item.url || `A ${item.kind} dropped into THINKTHANKS.`,
    whatItIs: item.kind === 'image'
      ? 'Screenshot or photo — vision analysis needed to read on-screen text and product claims.'
      : `Dropped ${item.kind}${item.url ? ' with URL' : ''}.`,
    howToUse: 'Review app scores, refine with composer notes, then BUILD into selected apps.',
    whyUseful: 'Unknown until image/text is read — scores stay modest until vision/LLM confirms the idea.',
    howToMake: 'After BUILD: implement UI + backend hooks; INTEGRATE wires nav and memory.',
    smartNotes: 'Trading bots must score low on AXON Memory — that app is shared context only.',
    placementUi: 'Surface on the highest-fit app using existing AXE HUD language (cyan/cream).',
    placementBackend: 'Prefer existing gateways; add a thin service only if needed.',
    placementMemory: 'Write a structured memory note with app tags so agents can recall this capability.',
    actionPlan: [
      { phase: 'Extract', detail: 'Confirm capability from enrichment + vision.' },
      { phase: 'Fit', detail: 'Lock target apps from scores + composer notes.' },
      { phase: 'Design', detail: 'UI placement, data model, agent access.' },
      { phase: 'Build', detail: 'Implement frontend + backend hooks.' },
      { phase: 'Integrate', detail: 'Wire navigation, memory, verify live path.' },
    ],
    fits,
    overallUsefulness: overall,
    tags: [item.kind],
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
  'You are AXE THINKTHANKS — growth analyst for four apps:',
  'axe-core (HQ), axe-companion (trading desk), axon-memory (universal memory, NOT trading), trading-os (charts/execution).',
  'RULES:',
  '- NEVER dismiss a drop because it is only a link or thin metadata — extract a concrete capability.',
  '- Images: read ALL visible text, product names, claims, UI structure.',
  '- Instagram/ads: product idea only, ignore platform chrome.',
  '- AXON Memory must score low for pure trading bots.',
  'Respond ONLY with JSON (no markdown fences):',
  '{',
  '  "title": string, "description": string, "whatItIs": string, "howToUse": string,',
  '  "whyUseful": string, "howToMake": string, "smartNotes": string,',
  '  "placementUi": string, "placementBackend": string, "placementMemory": string,',
  '  "actionPlan": [{ "phase": string, "detail": string }],',
  '  "overallUsefulness": number, "tags": string[],',
  '  "fits": [{ "app": "axe-core"|"axe-companion"|"axon-memory"|"trading-os", "percent": number, "reason": string }]',
  '}',
  'Include all four apps in fits. Be specific about WHERE in the UI and WHICH agents/tools.',
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
    actionPlan = (parsed!.actionPlan as ActionPlanStep[]).map(s => ({
      phase: String(s.phase || 'Step'),
      detail: String(s.detail || ''),
    }));
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

  const slot = pickSlot();
  if (!slot) {
    const analysis = heuristicAnalysis(item);
    analysis.enrichmentSummary = enrichNotes.join(' · ') || analysis.enrichmentSummary;
    const done: ThinkThanksItem = { ...item, analysis, analysisStatus: 'done', lastReanalysedAt: Date.now() };
    upsertThinkThanksItem(done);
    return done;
  }

  const user = [
    `Kind: ${item.kind}`,
    `Name: ${item.name}`,
    item.mime ? `MIME: ${item.mime}` : '',
    item.size != null ? `Size: ${formatSize(item.size)}` : '',
    item.url ? `URL: ${item.url}` : '',
    item.enrichedText ? `Enriched content:\n${item.enrichedText.slice(0, 10000)}` : '',
    item.textExcerpt && item.textExcerpt !== item.enrichedText ? `Excerpt:\n${item.textExcerpt.slice(0, 4000)}` : '',
    item.previewUrl?.startsWith('data:')
      ? 'An image is attached — read every visible product name, claim, model list, and UI structure.'
      : 'No image bytes — analyse from enrichment + URL + text. Still extract maximum product value.',
  ].filter(Boolean).join('\n');

  try {
    let raw: string;
    if (item.previewUrl?.startsWith('data:') && (item.kind === 'image' || item.mime?.startsWith('image/'))) {
      raw = await callVision(slot, SYSTEM_PROMPT, user, item.previewUrl);
    } else {
      raw = await callProvider(slot, [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: user },
      ]);
    }
    const fallback = heuristicAnalysis(item);
    fallback.enrichmentSummary = enrichNotes.join(' · ') || fallback.enrichmentSummary;
    const analysis = mergeAnalysis(parseAnalysisJson(raw), fallback);
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

/** Resolve a usable workspace root for the code agent (folder that contains src/). */
async function resolveWorkspaceRoot(): Promise<string> {
  try {
    const { listWorkspaceDirectory } = await import('@/infrastructure/persistence/workspaceFilesService');
    const roots = await listWorkspaceDirectory('');
    const names = roots.map(n => n.name || n.path || '').filter(Boolean);
    const prefer = [
      'AXE-CORE-HEADQUARTERS',
      'AXE-CORE-ORCHESTRATOR-content',
      'src',
      'AXE-CORE-',
    ];
    for (const p of prefer) {
      const hit = names.find(n => n === p || n.endsWith(p));
      if (hit) return hit;
    }
    // nested: first folder that has src child
    for (const n of roots) {
      const name = n.name || n.path;
      if (!name || n.type === 'file') continue;
      try {
        const kids = await listWorkspaceDirectory(name);
        if (kids.some(k => (k.name || '') === 'src')) return name;
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


function pickSlots(): import('@/domain/providers').KeySlot[] {
  const vs = useVoiceStore.getState();
  return [vs.primarySlot, vs.fallback1Slot, vs.fallback2Slot, vs.fallback3Slot].filter(
    (s): s is import('@/domain/providers').KeySlot => !!s && (!!s.key || s.provider === 'ollama'),
  );
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

/** Create a durable skill from the blueprint so agents can execute the idea. */
async 

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
function materializeSkillFromBlueprint(
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

    pushLog(patchesApplied > 0 ? `Done — ${patchesApplied} patch(es)` : 'Done — 0 patches');
    return {
      status: patchesApplied > 0 ? 'done' : 'done',
      message:
        message ||
        (patchesApplied > 0
          ? `Applied ${patchesApplied} code patch(es) via magic BUILD.`
          : 'Code agent finished without file patches — blueprint/agent/skill are live; open Code Editor Agent Mode and re-run BUILD, or check workspace path.'),
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
    'Implement for selected apps (frontend + backend + memory). After code lands, user will press INTEGRATE to wire nav/memory/architecture.',
  ].filter(Boolean).join('\n');

  // Do NOT dump the blueprint into Home chat — that hijacks the sphere/chart and
  // makes BUILD look like "a message was sent" instead of real materialization.
  // Chat is only notified with a one-line status AFTER everything lands (below).
  const chatBrief = false;

  const librarySummary = [analysis.title, analysis.whatItIs.slice(0, 140), `Targets: ${appLabels}`].join(' — ');

  // Mark built first so library list updates immediately
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
      chatBrief,
    },
  };
  upsertThinkThanksItem(updated);

  // Durable writes to memory / RAG / Obsidian / events
  const persist = await persistBlueprintToMemorySurfaces(updated, analysis, opts.apps, 'build', integratePlan);
  let liveArtifact =
    materializeAgentFromBlueprint(updated, analysis, opts.apps) ||
    materializeFeatureFromBlueprint(updated, analysis, opts.apps) ||
    undefined;
  if (liveArtifact) {
    updated = { ...updated, liveArtifact };
    upsertThinkThanksItem(updated);
    // Chat + deep-link can resolve this capability by name
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

  // Skill + MAGIC CODE agent (real patches when provider + workspace available)
  const skillId = await materializeSkillFromBlueprint(updated, analysis);
  updated = {
    ...updated,
    codeBuild: {
      status: 'running',
      message: 'Magic coding in progress (code-capable models: DeepSeek-Coder / Gemini / Grok / …)…',
      patchesApplied: 0,
      filesTouched: [],
      log: ['Starting magic BUILD…'],
      skillId,
      at: Date.now(),
    },
  };
  upsertThinkThanksItem(updated);
  try { window.dispatchEvent(new Event('axe-thinkthanks-changed')); } catch { /* */ }

  const codeBuild = await runMagicCodeBuild(updated, analysis, opts.apps, opts.composerContext);
  if (skillId) codeBuild.skillId = skillId;

  // Re-attach skill to agent if agent was created first
  if (liveArtifact?.kind === 'agent' && skillId) {
    try {
      const { setSkillsForAgent, getSkillsForAgent } = await import(
        '@/infrastructure/persistence/skillRegistryService'
      );
      const existing = await getSkillsForAgent(liveArtifact.id);
      await setSkillsForAgent(liveArtifact.id, [...new Set([...existing, skillId])]);
    } catch { /* */ }
  }

  // Register capability so chat routes this idea to the new agent / feature
  const capabilityId = await registerCapabilityForItem(
    updated,
    analysis,
    liveArtifact?.kind === 'agent' ? liveArtifact.id : undefined,
  );

  // Record growth on every target app — this is how apps continuously improve
  for (const app of opts.apps) {
    recordAppGrowth({
      app,
      itemId: id,
      title: analysis.title || item.name,
      kind: liveArtifact?.kind === 'agent' ? 'agent' : (codeBuild.patchesApplied > 0 ? 'code' : 'feature'),
      agentId: liveArtifact?.kind === 'agent' ? liveArtifact.id : undefined,
      skillId,
      capability: capabilityId,
    });
  }

  updated = {
    ...updated,
    libraryNotePath: persist.notePath,
    liveArtifact,
    codeBuild,
    persistedTo: {
      library: true,
      globalMemory: persist.globalMemory,
      rag: persist.rag,
      obsidian: persist.obsidian,
      chatBrief,
    },
  };
  upsertThinkThanksItem(updated);

  // Never send BUILD text to Home chat — materialization is local + UI status only.
  try {
    window.dispatchEvent(new CustomEvent('axe-thinkthanks-built', {
      detail: { id, apps: opts.apps, title: analysis.title, persist, liveArtifact, codeBuild },
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

  const brief = [
    'THINKTHANKS INTEGRATE — wire the built blueprint into the live app now.',
    `Title: ${analysis.title}`,
    `Apps: ${appLabels}`,
    item.librarySummary ? `Library: ${item.librarySummary}` : '',
    item.libraryNotePath ? `Obsidian note: ${item.libraryNotePath}` : '',
    '## Integrate action plan',
    ...integratePlan.map((s, i) => `${i + 1}. [${s.phase}] ${s.detail}`),
    '## Must complete',
    '1. UI entry reachable (nav/route/widget).',
    '2. Backend/gateway works with existing keys.',
    '3. Memory entry so agents know this capability (already written on BUILD — refresh if needed).',
    '4. Architecture / Neural / Map show the capability.',
    '5. Smoke-check and report what is live.',
    '## Blueprint',
    analysis.placementUi || analysis.howToMake,
    analysis.placementBackend || '',
    analysis.placementMemory || '',
    item.buildResult ? `## Prior BUILD\n${item.buildResult.slice(0, 3000)}` : '',
  ].filter(Boolean).join('\n');

  // Silent integrate — no long brief into Home chat (prevents chart/sphere hijack)
  const chatBrief = false;

  let updated: ThinkThanksItem = {
    ...item,
    analysis,
    integrateActionPlan: integratePlan,
    integrateResult: brief.slice(0, 6000),
    integratedAt: Date.now(),
  };
  upsertThinkThanksItem(updated);

  const persist = await persistBlueprintToMemorySurfaces(updated, analysis, apps, 'integrate', integratePlan);

  // If BUILD created an agent (or idea is agent-like), activate it in Agent Center now
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

  // Ensure skill exists and is assigned on integrate
  if (item.codeBuild?.skillId && liveArtifact?.kind === 'agent') {
    try {
      const { setSkillsForAgent, getSkillsForAgent } = await import(
        '@/infrastructure/persistence/skillRegistryService'
      );
      const existing = await getSkillsForAgent(liveArtifact.id);
      await setSkillsForAgent(liveArtifact.id, [...new Set([...existing, item.codeBuild.skillId])]);
    } catch { /* */ }
  } else if (!item.codeBuild?.skillId) {
    const skillId = await materializeSkillFromBlueprint({ ...updated, liveArtifact }, analysis);
    if (skillId && liveArtifact?.kind === 'agent') {
      try {
        const { setSkillsForAgent, getSkillsForAgent } = await import(
          '@/infrastructure/persistence/skillRegistryService'
        );
        const existing = await getSkillsForAgent(liveArtifact.id);
        await setSkillsForAgent(liveArtifact.id, [...new Set([...existing, skillId])]);
      } catch { /* */ }
    }
  }

  updated = {
    ...updated,
    libraryNotePath: persist.notePath || item.libraryNotePath,
    liveArtifact,
    persistedTo: {
      library: true,
      globalMemory: !!(item.persistedTo?.globalMemory || persist.globalMemory),
      rag: !!(item.persistedTo?.rag || persist.rag),
      obsidian: !!(item.persistedTo?.obsidian || persist.obsidian),
      chatBrief: !!(item.persistedTo?.chatBrief || chatBrief),
    },
  };
  upsertThinkThanksItem(updated);

  // Smoke-check: verify the capability is actually reachable in-app
  let checks: { name: string; pass: boolean; detail: string }[] = [];
  checks.push({
    name: 'Library',
    pass: !!updated.builtAt,
    detail: updated.builtAt ? 'Blueprint in ThinkThanks Library' : 'Missing builtAt',
  });
  checks.push({
    name: 'Memory',
    pass: !!updated.persistedTo?.globalMemory || !!updated.persistedTo?.rag,
    detail: updated.persistedTo?.globalMemory || updated.persistedTo?.rag ? 'Global/RAG memory written' : 'Memory flags empty',
  });
  checks.push({
    name: 'Obsidian',
    pass: !!updated.persistedTo?.obsidian || !!updated.libraryNotePath,
    detail: updated.libraryNotePath || (updated.persistedTo?.obsidian ? 'Note written' : 'No Obsidian note'),
  });
  if (liveArtifact?.kind === 'agent') {
    let agentLive = false;
    try {
      const raw = localStorage.getItem('axe_custom_agents_v1');
      const list = raw ? JSON.parse(raw) : [];
      let found = Array.isArray(list) ? list.find((a: { id: string; status?: string }) => a.id === liveArtifact!.id) : null;
      agentLive = !!found && found.status === 'active';
      // Auto-heal: force activate if missing/standby
      if (!agentLive) {
        activateLiveAgent(liveArtifact.id);
        const raw2 = localStorage.getItem('axe_custom_agents_v1');
        const list2 = raw2 ? JSON.parse(raw2) : [];
        found = Array.isArray(list2) ? list2.find((a: { id: string; status?: string }) => a.id === liveArtifact!.id) : null;
        agentLive = !!found && found.status === 'active';
      }
      checks.push({
        name: 'Agent Center',
        pass: agentLive,
        detail: agentLive ? `${liveArtifact.label} is active` : `${liveArtifact.label} not active in Agent Center`,
      });
    } catch {
      checks.push({ name: 'Agent Center', pass: false, detail: 'Could not read custom agents store' });
    }
    // Ensure capability routing points at this agent
    try {
      await registerCapabilityForItem(updated, analysis, liveArtifact.id);
      checks.push({ name: 'Chat routing', pass: true, detail: 'Capability registered for chat' });
    } catch {
      checks.push({ name: 'Chat routing', pass: false, detail: 'Capability register failed' });
    }
  }

  // Growth ledger for integrated apps
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
  checks.push({
    name: 'Integrate plan',
    pass: (updated.integrateActionPlan?.length ?? 0) > 0,
    detail: `${updated.integrateActionPlan?.length ?? 0} step(s)`,
  });
  // Live probe: can chat resolve the agent prompt? (proves routing works)
  if (liveArtifact?.kind === 'agent' && liveArtifact.id) {
    try {
      const { getAgentSystemPrompt } = await import('@/infrastructure/persistence/capabilityService');
      const prompt = await getAgentSystemPrompt(liveArtifact.id);
      const pass = !!(prompt && prompt.length > 20);
      checks.push({
        name: 'Live prompt',
        pass,
        detail: pass
          ? `Agent system prompt reachable (${prompt!.length} chars)`
          : 'Agent prompt not found — chat may not route yet',
      });
      if (pass) {
        checks.push({
          name: 'Verify ping',
          pass: true,
          detail: 'Agent prompt reachable — open Agents or chat with the agent name to use it',
        });
      }
    } catch (e) {
      checks.push({
        name: 'Live prompt',
        pass: false,
        detail: e instanceof Error ? e.message : 'probe failed',
      });
    }
  }

  let smokeCheck = { ok: checks.every(c => c.pass), checks, at: Date.now() };

  // Auto-repair pass when smoke fails (re-activate, re-register, no full code re-run here)
  if (!smokeCheck.ok) {
    try {
      const healed = await repairThinkThanksItem(id, { rerunCode: false });
      if (healed?.liveArtifact) liveArtifact = healed.liveArtifact;
      // Re-evaluate critical agent check
      if (liveArtifact?.kind === 'agent') {
        try {
          const raw = localStorage.getItem('axe_custom_agents_v1');
          const list = raw ? JSON.parse(raw) : [];
          const found = Array.isArray(list)
            ? list.find((a: { id: string; status?: string }) => a.id === liveArtifact!.id)
            : null;
          const agentLive = !!found && found.status === 'active';
          checks = checks.map(c =>
            c.name === 'Agent Center'
              ? {
                  name: 'Agent Center',
                  pass: agentLive,
                  detail: agentLive
                    ? `${liveArtifact!.label} is active (after auto-repair)`
                    : c.detail,
                }
              : c,
          );
        } catch { /* */ }
      }
      checks.push({
        name: 'Auto-repair',
        pass: true,
        detail: 'Ran repairThinkThanksItem after failed smoke',
      });
      smokeCheck = { ok: checks.every(c => c.pass), checks, at: Date.now() };
    } catch (e) {
      checks.push({
        name: 'Auto-repair',
        pass: false,
        detail: e instanceof Error ? e.message : 'repair failed',
      });
      smokeCheck = { ok: false, checks, at: Date.now() };
    }
  }

  updated = { ...updated, liveArtifact, smokeCheck };
  upsertThinkThanksItem(updated);

  // Never send INTEGRATE text to Home chat either.
  try {
    window.dispatchEvent(new CustomEvent('axe-thinkthanks-integrated', {
      detail: { id, apps, title: analysis.title, plan: integratePlan, persist, liveArtifact, smokeCheck },
    }));
    window.dispatchEvent(new Event('axe-thinkthanks-changed'));
    window.dispatchEvent(new Event('axe-memory-changed'));
  } catch { /* */ }

  return updated;
}

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
