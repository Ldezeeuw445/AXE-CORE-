/**
 * One icon per memory hub, shared by every view that draws one.
 *
 * This lived as a private const inside NeuralMemorySystem, which is how the
 * terrain ended up with no icons at all: the summits you actually see are
 * drawn by terrain/TerrainMarkers, a separate component that had no way to
 * reach this map. Two renderers, one taxonomy, and the icons only existed in
 * the half that was no longer on screen.
 *
 * Colour and name already live in domain/memory/memoryHubs. The glyph cannot
 * live there -- that is a domain module and lucide is a presentation
 * dependency -- so it lives here, next to the views, and is imported rather
 * than copied.
 */
import {
  Brain, Settings2, MessageSquare, Zap, Lightbulb, Database, Users, BookOpen,
  FileText, Layers, CandlestickChart, Target, FolderKanban, Bot,
} from 'lucide-react';
import type { HubId } from '@/domain/memory/memoryHubs';

export type HubIcon = typeof Brain;

const ICONS: Record<string, HubIcon> = {
  core: Brain,
  knowledge: BookOpen,
  conversations: MessageSquare,
  tasksgoals: Target,
  projects: FolderKanban,
  insights: Lightbulb,
  resources: Database,
  preferences: Settings2,
  events: Zap,
  agents: Bot,
  trading: CandlestickChart,
  // legacy keys still produced by older data paths
  specialists: Users,
  obsidian: FileText,
  default: Layers,
};

/**
 * Accepts a bare hub id (`trading`) or the prefixed form the terrain uses
 * (`hub-trading`), because the two renderers disagree about that and a lookup
 * that silently misses is how every hub ended up with the same fallback glyph.
 */
export function hubIcon(key: string | HubId | undefined | null): HubIcon {
  if (!key) return ICONS.default;
  const k = String(key).replace(/^hub-/, '');
  return ICONS[k] ?? ICONS.default;
}

export const HUB_ICONS = ICONS;
