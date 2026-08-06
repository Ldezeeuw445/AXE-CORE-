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

export async function buildThinkThanksItem(id: string, opts: BuildOptions): Promise<ThinkThanksItem> {
  const item = getThinkThanksItem(id);
  if (!item) throw new Error('Item not found');
  if (!opts.apps.length) throw new Error('Select at least one app');
  const analysis = item.analysis ?? heuristicAnalysis(item);
  const appLabels = opts.apps.map(a => TARGET_APPS.find(t => t.id === a)?.label ?? a).join(', ');
  const category =
    analysis.tags?.[0] ||
    (opts.apps.includes('trading-os') ? 'Trading' : opts.apps.includes('axon-memory') ? 'Memory' : 'Product');

  const brief = [
    'THINKTHANKS BUILD REQUEST',
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
    'Implement end-to-end for selected apps (frontend + backend + memory). Do not force trading agents into AXON Memory.',
  ].filter(Boolean).join('\n');

  try {
    const send = useVoiceStore.getState().sendMessage;
    if (typeof send === 'function') await send(brief);
  } catch (e) {
    console.warn('[thinkthanks] BUILD sendMessage failed', e);
  }
  try {
    window.dispatchEvent(new CustomEvent('axe-thinkthanks-built', { detail: { id, apps: opts.apps } }));
  } catch { /* */ }

  const librarySummary = [analysis.title, analysis.whatItIs.slice(0, 140), `Targets: ${appLabels}`].join(' — ');
  const updated: ThinkThanksItem = {
    ...item,
    analysis,
    builtAt: Date.now(),
    builtApps: opts.apps,
    buildResult: brief.slice(0, 4000),
    libraryCategory: category,
    librarySummary,
  };
  upsertThinkThanksItem(updated);
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
  const apps = item.builtApps?.map(a => TARGET_APPS.find(t => t.id === a)?.label ?? a).join(', ') || 'AXE Core';
  const brief = [
    'THINKTHANKS INTEGRATE — wire the built blueprint into the live app now.',
    `Title: ${analysis.title}`,
    `Apps: ${apps}`,
    item.librarySummary ? `Library: ${item.librarySummary}` : '',
    '## Must complete',
    '1. UI entry reachable (nav/route/widget).',
    '2. Backend/gateway works with existing keys.',
    '3. Memory entry so agents know this capability.',
    '4. Smoke-check and report what is live.',
    '## Blueprint',
    analysis.placementUi || analysis.howToMake,
    analysis.placementBackend || '',
    analysis.placementMemory || '',
    ...(analysis.actionPlan || []).map(s => `- [${s.phase}] ${s.detail}`),
    item.buildResult ? `## Prior BUILD\n${item.buildResult.slice(0, 3000)}` : '',
  ].filter(Boolean).join('\n');
  try {
    const send = useVoiceStore.getState().sendMessage;
    if (typeof send === 'function') await send(brief);
  } catch (e) {
    console.warn('[thinkthanks] INTEGRATE failed', e);
  }
  try {
    window.dispatchEvent(new CustomEvent('axe-thinkthanks-integrated', { detail: { id, apps: item.builtApps } }));
  } catch { /* */ }
  const updated: ThinkThanksItem = { ...item, integratedAt: Date.now() };
  upsertThinkThanksItem(updated);
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
