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

export interface ThinkThanksAnalysis {
  title: string;
  description: string;
  whatItIs: string;
  howToUse: string;
  whyUseful: string;
  howToMake: string;
  smartNotes: string;
  fits: AppFitScore[];
  overallUsefulness: number;
  tags: string[];
  analysedAt: number;
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
  analysisStatus: 'pending' | 'analysing' | 'done' | 'error';
  analysisError?: string;
  builtAt?: number;
  builtApps?: TargetApp[];
  buildResult?: string;
  libraryCategory?: string;
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
  return listThinkThanksItems().filter(i => i.builtAt);
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
    howToMake: 'After BUILD: implement via AXE chat with explicit target apps.',
    smartNotes: 'Trading bots must score low on AXON Memory — that app is shared context only.',
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
  'You are AXE THINKTHANKS — product analyst for the AXE ecosystem.',
  'When an image is attached, YOU MUST describe what is actually visible (UI, logos, product name, claims, layout).',
  'Instagram ads/screenshots: extract the product idea, not the Instagram chrome.',
  'Apps (be strict):',
  '- axe-core: desktop HQ — agents, architecture, tools, multi-API orchestration.',
  '- axe-companion: conversational trading assistant (charts, MetaAPI, mobile desk).',
  '- axon-memory: UNIVERSAL MEMORY across apps/mail/notes/AIs. NOT trading. NOT autonomous trading agents. Low score for pure trading bots.',
  '- trading-os: charts, execution, market intel, strategies.',
  'Respond ONLY with compact JSON (no markdown fences):',
  '{ "title": string, "description": string, "whatItIs": string, "howToUse": string, "whyUseful": string, "howToMake": string, "smartNotes": string, "overallUsefulness": number, "tags": string[], "fits": [{ "app": "axe-core"|"axe-companion"|"axon-memory"|"trading-os", "percent": number, "reason": string }] }',
  'Always include all four apps in fits. Be honest with low percentages.',
].join('\n');

async function callVision(slot: KeySlot, system: string, userText: string, dataUrl: string): Promise<string> {
  const cfg = PROVIDERS.find(p => p.id === slot.provider);
  if (!cfg) return callProvider(slot, [{ role: 'system', content: system }, { role: 'user', content: userText }]);
  const base = toProxied(slot.baseUrl || cfg.baseUrl);
  const model = slot.model || cfg.defaultModel;
  const signal = AbortSignal.timeout(45_000);
  const m = dataUrl.match(/^data:([^;]+);base64,(.+)$/);
  const mime = m?.[1] || 'image/jpeg';
  const b64 = m?.[2] || '';

  if (cfg.format === 'google') {
    const r = await fetch(`${base}/v1beta/models/${model}:generateContent`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-goog-api-key': slot.key },
      signal,
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: system }] },
        contents: [{ role: 'user', parts: [{ text: userText }, ...(b64 ? [{ inlineData: { mimeType: mime, data: b64 } }] : []) }] }],
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
    const r = await fetch(chatPath, {
      method: 'POST',
      headers: { ...(slot.key ? { Authorization: `Bearer ${slot.key}` } : {}), 'Content-Type': 'application/json' },
      signal,
      body: JSON.stringify({
        model,
        max_tokens: 4096,
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: [{ type: 'text', text: userText }, ...(dataUrl ? [{ type: 'image_url', image_url: { url: dataUrl } }] : [])] },
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
  return {
    title: String(parsed?.title || fallback.title),
    description: String(parsed?.description || fallback.description),
    whatItIs: String(parsed?.whatItIs || fallback.whatItIs),
    howToUse: String(parsed?.howToUse || fallback.howToUse),
    whyUseful: String(parsed?.whyUseful || fallback.whyUseful),
    howToMake: String(parsed?.howToMake || fallback.howToMake),
    smartNotes: String(parsed?.smartNotes || fallback.smartNotes),
    fits,
    overallUsefulness: Math.max(0, Math.min(100, Number(parsed?.overallUsefulness ?? fallback.overallUsefulness) || 0)),
    tags: Array.isArray(parsed?.tags) ? parsed!.tags!.map(String) : fallback.tags,
    analysedAt: Date.now(),
  };
}

export async function analyseThinkThanksItem(id: string): Promise<ThinkThanksItem> {
  const item = getThinkThanksItem(id);
  if (!item) throw new Error('Item not found');
  upsertThinkThanksItem({ ...item, analysisStatus: 'analysing', analysisError: undefined });

  const slot = pickSlot();
  if (!slot) {
    const analysis = heuristicAnalysis(item);
    const done: ThinkThanksItem = { ...item, analysis, analysisStatus: 'done' };
    upsertThinkThanksItem(done);
    return done;
  }

  const user = [
    `Kind: ${item.kind}`,
    `Name: ${item.name}`,
    item.mime ? `MIME: ${item.mime}` : '',
    item.size != null ? `Size: ${formatSize(item.size)}` : '',
    item.url ? `URL: ${item.url}` : '',
    item.textExcerpt ? `Excerpt:\n${item.textExcerpt.slice(0, 6000)}` : '',
    item.previewUrl?.startsWith('data:')
      ? 'An image is attached — read every visible product name, claim, model list, and UI structure.'
      : 'No image bytes — analyse from metadata/text only.',
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
    const analysis = mergeAnalysis(parseAnalysisJson(raw), heuristicAnalysis(item));
    const done: ThinkThanksItem = { ...item, analysis, analysisStatus: 'done' };
    upsertThinkThanksItem(done);
    return done;
  } catch (e) {
    const analysis = heuristicAnalysis(item);
    const err = e instanceof Error ? e.message : String(e);
    const done: ThinkThanksItem = { ...item, analysis, analysisStatus: 'done', analysisError: err };
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
    `## Target apps\n${appLabels}`,
    '## Fits',
    ...analysis.fits.map(f => `- ${TARGET_APPS.find(t => t.id === f.app)?.label ?? f.app}: ${f.percent}% — ${f.reason}`),
    opts.composerContext.trim() ? `## Extra context\n${opts.composerContext.trim()}` : '',
    '## Job',
    'Concrete integration plan for selected apps. Do not force trading agents into AXON Memory.',
  ].filter(Boolean).join('\n');

  try {
    const send = useVoiceStore.getState().sendMessage;
    if (typeof send === 'function') await send(brief);
  } catch (e) {
    console.warn('[thinkthanks] sendMessage failed', e);
  }

  const updated: ThinkThanksItem = {
    ...item,
    analysis,
    builtAt: Date.now(),
    builtApps: opts.apps,
    buildResult: brief.slice(0, 2000),
    libraryCategory: category,
  };
  upsertThinkThanksItem(updated);
  return updated;
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
