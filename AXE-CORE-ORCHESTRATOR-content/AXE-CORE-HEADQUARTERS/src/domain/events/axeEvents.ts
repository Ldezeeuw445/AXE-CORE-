/**
 * Canonical cross-UI / cross-layer event contracts.
 * Payload types only — emission lives in infrastructure/events/eventBus.ts.
 */

import type { ProjectionPayload } from '@/domain/sphere/projectionTypes';

export interface AxeEventMap {
  'axe:scroll-to-approval': { reason?: string };
  'axe:sphere-morph': { key: string };
  /** Living Display — project resolved payload onto the sphere stage. */
  'axe:sphere-project': ProjectionPayload;
  /** Living Display — fold projection back into the sphere. */
  'axe:sphere-dismiss': { reason?: string };
  'axe:open-browser': { url: string };
  'axe:habits-updated': Record<string, never>;
  'axe:ring-updated': Record<string, never>;
  'axe:skills-changed': { agentKey?: string; skillIds?: string[] };
  'axe:organization-refresh': { reason?: string };
  'axe:memory-changed': { kind?: 'memory' | 'obsidian' | 'reflect' };
  'axe:crew-status': { status: 'started' | 'finished' | 'error'; task?: string; message?: string };
  'axe:health-ping': { service: string; ok: boolean; detail?: string };
  'axe:chat-message': { role: 'user' | 'axe'; preview: string };
  'axe:files-attached': { names: string[]; count: number };
}

export type AxeEventName = keyof AxeEventMap;

export const LEGACY_WINDOW_EVENTS: Partial<Record<AxeEventName, string>> = {
  'axe:scroll-to-approval': 'axe-scroll-to-approval',
  'axe:sphere-morph': 'axe-sphere-morph',
  'axe:open-browser': 'axe-open-browser',
  'axe:habits-updated': 'axe-habits-updated',
  'axe:ring-updated': 'axe-ring-updated',
};
