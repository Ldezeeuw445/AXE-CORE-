/**
 * THINKTHANKS — drop anything (file, photo, video, link, note, Instagram reel),
 * auto-analyse for fit across AXE Core / Companion / AXON Memory / Trading OS,
 * then BUILD into the chosen app(s) with optional composer context.
 */

import { callProvider } from '@/infrastructure/gateways/llmGateway';
import type { KeySlot } from '@/domain/providers';
import { normalizeFiles, type NormalizedAttachment, formatSize } from '@/application/attachments/attachmentService';
import { useVoiceStore } from '@/presentation/store/voiceStore';

export type TargetApp = 'axe-core' | 'axe-companion' | 'axon-memory' | 'trading-os';

export const TARGET_APPS: { id: TargetApp; label: string; color: string }[] = [
  { id: 'axe-core', label: 'AXE Core', color: '#22d3ee' },
  { id: 'axe-companion', label: 'AXE Companion', color: '#a855f7' },
  { id: 'axon-memory', label: 'AXON Memory', color: '#34d399' },
  { id: 'trading-os', label: 'Trading OS', color: '#f59e0b' },
];

export type ThinkItemKind =
  | 'file'
  | 'image'
  | 'video'
  | 'audio'
  | 'link'
  | 'note'
  | 'instagram-reel'
  | 'binary';

export interface AppFitScore {
  app: TargetApp;
  percent: number;
  reason: string;
}

export interface ThinkThanksAnalysis {
  title: string;
  description: string;
  whatItIs: string;
  howToUse: string;
  howToMake: string;
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
  } catch (e) {
    console.warn('[thinkthanks] persist failed', e);
  }
}

export function listThinkThanksItems(): ThinkThanksItem[] {
  return loadRaw().sort((a, b) => b.createdAt - a.createdAt);
}

export function getThinkThanksItem(id: string): ThinkThanksItem | undefined {
  return loadRaw().find(i => i.id === id);
}

export function upsertThinkThanksItem(item: ThinkThanksItem): void {
  const all = loadRaw().filter(i => i.id !== item.id);
  all.unshift(item);
  saveRaw(all);
  window.dispatchEvent(new CustomEvent('axe-thinkthanks-changed'));
}

export function deleteThinkThanksItem(id: string): void {
  saveRaw(loadRaw().filter(i => i.id !== id));
  window.dispatchEvent(new CustomEvent('axe-thinkthanks-changed'));
}

export function isInstagramUrl(text: string): boolean {
  return /(?:https?:\/\/)?(?:www\.)?(?:instagram\.com|instagr\.am)\/(?:reel|reels|p|tv|stories)\//i.test(text.trim());
}

export function extractUrls(text: string): string[] {
  const re = /https?:\/\/[^\s<>"')\]]+/gi;
  return text.match(re) ?? [];
}

function kindFromAttachment(att: NormalizedAttachment): ThinkItemKind {
  if (att.kind === 'image') return 'image';
  if (att.kind === 'video') return 'video';
  if (att.kind === 'audio') return 'audio';
  if (att.kind === 'text' || att.kind === 'pdf' || att.kind === 'office') return 'file';
  return 'binary';
}

function pickSlot(): KeySlot | null {
  const vs = useVoiceStore.getState();
  const slots = [vs.primarySlot, vs.fallback1Slot, vs.fallback2Slot, vs.fallback3Slot].filter(
    (s): s is KeySlot => !!s && (!!s.key || s.provider === 'ollama'),
  );
  return slots[0] ?? null;
}

function heuristicAnalysis(item: ThinkThanksItem): ThinkThanksAnalysis {
  const name = item.name.toLowerCase();
  const text = (item.textExcerpt || item.sourceText || item.url || '').toLowerCase();
  const blob = `${name} ${text}`;

  const scores: Record<TargetApp, number> = {
    'axe-core': 35,
    'axe-companion': 30,
    'axon-memory': 40,
    'trading-os': 25,
  };

  if (/trad|chart|forex|crypto|smc|order\s*block|market|broker|metaapi|ibkr/i.test(blob)) {
    scores['trading-os'] += 45;
    scores['axe-companion'] += 20;
  }
  if (/memory|note|obsidian|journal|reflect|knowledge|rag|embed/i.test(blob)) {
    scores['axon-memory'] += 40;
    scores['axe-core'] += 15;
  }
  if (/ui|widget|sidebar|layout|component|react|tauri|home|dashboard/i.test(blob)) {
    scores['axe-core'] += 35;
  }
  if (/companion|chat|voice|assistant|tts|stt/i.test(blob)) {
    scores['axe-companion'] += 35;
  }
  if (item.kind === 'instagram-reel') {
    scores['axe-core'] += 20;
    scores['axe-companion'] += 15;
  }
  if (item.kind === 'image' || item.kind === 'video') {
    scores['axe-core'] += 10;
    scores['axon-memory'] += 10;
  }

  const fits: AppFitScore[] = (Object.keys(scores) as TargetApp[]).map(app => ({
    app,
    percent: Math.max(0, Math.min(100, scores[app])),
    reason:
      scores[app] >= 70
        ? 'Strong thematic match'
        : scores[app] >= 45
          ? 'Partial match — usable with adaptation'
          : 'Weak match — only if forced',
  }));
  fits.sort((a, b) => b.percent - a.percent);

  const overall = Math.round(fits.reduce((s, f) => s + f.percent, 0) / fits.length);

  return {
    title: item.name.slice(0, 80) || 'Dropped item',
    description: item.textExcerpt?.slice(0, 240) || item.url || `A ${item.kind} dropped into THINKTHANKS.`,
    whatItIs: `Detected as ${item.kind}${item.mime ? ` (${item.mime})` : ''}. ${item.size ? formatSize(item.size) + '.' : ''}`,
    howToUse: 'Review the app-fit scores, pick one or more target apps, add context in the composer, then press BUILD.',
    howToMake: 'BUILD sends a structured brief into AXE chat so the Code Agent / crew can implement the idea.',
    fits,
    overallUsefulness: overall,
    tags: [item.kind, ...fits.filter(f => f.percent >= 50).map(f => f.app)],
    analysedAt: Date.now(),
  };
}

function parseAnalysisJson(raw: string): Partial<ThinkThanksAnalysis> | null {
  try {
    const start = raw.indexOf('{');
    const end = raw.lastIndexOf('}');
    if (start < 0 || end <= start) return null;
    return JSON.parse(raw.slice(start, end + 1)) as Partial<ThinkThanksAnalysis>;
  } catch {
    return null;
  }
}

export async function analyseThinkThanksItem(id: string): Promise<ThinkThanksItem> {
  const item = getThinkThanksItem(id);
  if (!item) throw new Error('Item not found');

  const pending: ThinkThanksItem = { ...item, analysisStatus: 'analysing', analysisError: undefined };
  upsertThinkThanksItem(pending);

  const slot = pickSlot();
  if (!slot) {
    const analysis = heuristicAnalysis(item);
    const done: ThinkThanksItem = { ...item, analysis, analysisStatus: 'done' };
    upsertThinkThanksItem(done);
    return done;
  }

  const system = [
    'You are AXE THINKTHANKS — classify dropped content for the AXE ecosystem.',
    'Apps: AXE Core (desktop HQ/Tauri), AXE Companion (conversational trading assistant),',
    'AXON Memory (universal memory layer), Trading OS (charts/execution/intel).',
    'Respond ONLY with compact JSON (no markdown fences):',
    '{',
    '  "title": string,',
    '  "description": string,',
    '  "whatItIs": string,',
    '  "howToUse": string,',
    '  "howToMake": string,',
    '  "overallUsefulness": number 0-100,',
    '  "tags": string[],',
    '  "fits": [{ "app": "axe-core"|"axe-companion"|"axon-memory"|"trading-os", "percent": 0-100, "reason": string }]',
    '}',
    'Be honest: low percentages when content is noise. Instagram reels → extract the product/UX idea, not the platform.',
  ].join('\n');

  const user = [
    `Kind: ${item.kind}`,
    `Name: ${item.name}`,
    item.mime ? `MIME: ${item.mime}` : '',
    item.size != null ? `Size: ${formatSize(item.size)}` : '',
    item.url ? `URL: ${item.url}` : '',
    item.textExcerpt ? `Excerpt:\n${item.textExcerpt.slice(0, 6000)}` : '',
    item.sourceText && item.sourceText !== item.textExcerpt ? `Source text:\n${item.sourceText.slice(0, 3000)}` : '',
  ]
    .filter(Boolean)
    .join('\n');

  try {
    const raw = await callProvider(slot, [
      { role: 'system', content: system },
      { role: 'user', content: user },
    ]);
    const parsed = parseAnalysisJson(raw);
    const fallback = heuristicAnalysis(item);
    const fits =
      Array.isArray(parsed?.fits) && parsed!.fits!.length
        ? (parsed!.fits as AppFitScore[]).map(f => ({
            app: f.app,
            percent: Math.max(0, Math.min(100, Number(f.percent) || 0)),
            reason: String(f.reason || ''),
          }))
        : fallback.fits;
    fits.sort((a, b) => b.percent - a.percent);

    const analysis: ThinkThanksAnalysis = {
      title: String(parsed?.title || fallback.title),
      description: String(parsed?.description || fallback.description),
      whatItIs: String(parsed?.whatItIs || fallback.whatItIs),
      howToUse: String(parsed?.howToUse || fallback.howToUse),
      howToMake: String(parsed?.howToMake || fallback.howToMake),
      fits,
      overallUsefulness: Math.max(
        0,
        Math.min(100, Number(parsed?.overallUsefulness ?? fallback.overallUsefulness) || 0),
      ),
      tags: Array.isArray(parsed?.tags) ? parsed!.tags!.map(String) : fallback.tags,
      analysedAt: Date.now(),
    };

    const done: ThinkThanksItem = { ...item, analysis, analysisStatus: 'done' };
    upsertThinkThanksItem(done);
    return done;
  } catch (e) {
    const analysis = heuristicAnalysis(item);
    const err = e instanceof Error ? e.message : String(e);
    const done: ThinkThanksItem = {
      ...item,
      analysis,
      analysisStatus: 'done',
      analysisError: err,
    };
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
  const primaryUrl = urls[0];
  const insta = primaryUrl ? isInstagramUrl(primaryUrl) : isInstagramUrl(text);
  const isPureUrl = /^https?:\/\S+$/i.test(text) || (urls.length === 1 && text === urls[0]);

  let kind: ThinkItemKind = 'note';
  if (insta) kind = 'instagram-reel';
  else if (isPureUrl || primaryUrl) kind = 'link';

  const item: ThinkThanksItem = {
    id: uid(),
    createdAt: Date.now(),
    kind,
    name:
      kind === 'instagram-reel'
        ? 'Instagram Reel'
        : kind === 'link'
          ? (primaryUrl || text).replace(/^https?:\/\//, '').slice(0, 60)
          : text.slice(0, 60) || 'Note',
    sourceText: text,
    url: primaryUrl || (insta ? text : undefined),
    textExcerpt: text,
    analysisStatus: 'pending',
  };
  upsertThinkThanksItem(item);
  void analyseThinkThanksItem(item.id);
  return item;
}

export interface BuildOptions {
  apps: TargetApp[];
  composerContext: string;
}

export async function buildThinkThanksItem(id: string, opts: BuildOptions): Promise<ThinkThanksItem> {
  const item = getThinkThanksItem(id);
  if (!item) throw new Error('Item not found');
  if (!opts.apps.length) throw new Error('Select at least one app');

  const analysis = item.analysis ?? heuristicAnalysis(item);
  const appLabels = opts.apps
    .map(a => TARGET_APPS.find(t => t.id === a)?.label ?? a)
    .join(', ');

  const brief = [
    `THINKTHANKS BUILD REQUEST`,
    ``,
    `Title: ${analysis.title}`,
    `Source kind: ${item.kind}`,
    `Source name: ${item.name}`,
    item.url ? `URL: ${item.url}` : '',
    ``,
    `## What it is`,
    analysis.whatItIs || analysis.description,
    ``,
    `## How to use it`,
    analysis.howToUse,
    ``,
    `## How to make / integrate`,
    analysis.howToMake,
    ``,
    `## Target app(s)`,
    appLabels,
    ``,
    `## App-fit scores`,
    ...analysis.fits.map(f => {
      const label = TARGET_APPS.find(t => t.id === f.app)?.label ?? f.app;
      return `- ${label}: ${f.percent}% — ${f.reason}`;
    }),
    ``,
    opts.composerContext.trim() ? `## Extra context from user\n${opts.composerContext.trim()}` : '',
    ``,
    `## Your job`,
    `Produce a concrete integration plan for the selected app(s) and start implementing where possible.`,
    `Prefer small, reviewable steps (routes, widgets, memory keys, API hooks).`,
    `If the source is an Instagram reel, extract the idea / feature and translate it into AXE-native UX — do not embed Instagram UI.`,
    item.textExcerpt ? `\n## Source excerpt\n${item.textExcerpt.slice(0, 4000)}` : '',
  ]
    .filter(Boolean)
    .join('\n');

  try {
    const send = useVoiceStore.getState().sendMessage;
    if (typeof send === 'function') {
      await send(brief);
    }
  } catch (e) {
    console.warn('[thinkthanks] sendMessage failed', e);
  }

  const updated: ThinkThanksItem = {
    ...item,
    analysis,
    builtAt: Date.now(),
    builtApps: opts.apps,
    buildResult: brief.slice(0, 2000),
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
  return 'Mostly useless';
}
