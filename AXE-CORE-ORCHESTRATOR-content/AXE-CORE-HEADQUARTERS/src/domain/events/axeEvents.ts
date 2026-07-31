/**
 * Canonical cross-UI / cross-layer event contracts.
 * Payload types only — emission lives in infrastructure/events/eventBus.ts.
 */

export interface AxeEventMap {
  /** Scroll chat to pending approval card. */
  'axe:scroll-to-approval': { reason?: string };

  /** Holographic sphere visual morph key (nav / status). */
  'axe:sphere-morph': { key: string };

  /** Open Browser tab/window to a URL. */
  'axe:open-browser': { url: string };

  /** Habit tracker data changed. */
  'axe:habits-updated': Record<string, never>;

  /** Smart ring snapshot changed. */
  'axe:ring-updated': Record<string, never>;

  /** Agent skills or custom skill library changed. */
  'axe:skills-changed': { agentKey?: string; skillIds?: string[] };

  /** Architecture / organization tree should refresh. */
  'axe:organization-refresh': { reason?: string };

  /** Memory or Obsidian notes mutated. */
  'axe:memory-changed': { kind?: 'memory' | 'obsidian' | 'reflect' };

  /** CrewAI run started / finished (UI status). */
  'axe:crew-status': { status: 'started' | 'finished' | 'error'; task?: string; message?: string };

  /** Generic system health probe result for HUD chips. */
  'axe:health-ping': { service: string; ok: boolean; detail?: string };

  /** Chat received a user or axe message (side panels can react). */
  'axe:chat-message': { role: 'user' | 'axe'; preview: string };

  /** File(s) attached in home chat. */
  'axe:files-attached': { names: string[]; count: number };
}

export type AxeEventName = keyof AxeEventMap;

/** Legacy window event names → bus names (migration bridge). */
export const LEGACY_WINDOW_EVENTS: Partial<Record<AxeEventName, string>> = {
  'axe:scroll-to-approval': 'axe-scroll-to-approval',
  'axe:sphere-morph': 'axe-sphere-morph',
  'axe:open-browser': 'axe-open-browser',
  'axe:habits-updated': 'axe-habits-updated',
  'axe:ring-updated': 'axe-ring-updated',
};
