/**
 * infrastructure/persistence/routingLogStore.ts
 *
 * Local persistence for the provider-routing decision log shown in the
 * Routing panel. Entries older than 7 days are dropped on load; the log is
 * capped at 50 entries.
 */

import type { RoutingEvent } from '@/core/llm/types';
import { readString, writeJSON, remove } from '@/infrastructure/storage/localStore';

export const ROUTING_LOG_KEY = 'axe_routing_log';
const ROUTING_LOG_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;
const ROUTING_LOG_MAX_ENTRIES = 50;

export function loadRoutingLog(): RoutingEvent[] {
  try {
    const raw = readString(ROUTING_LOG_KEY);
    if (!raw) return [];
    const parsed: RoutingEvent[] = JSON.parse(raw);
    const cutoff = Date.now() - ROUTING_LOG_MAX_AGE_MS;
    return parsed.filter(e => e.ts > cutoff).slice(0, ROUTING_LOG_MAX_ENTRIES);
  } catch { return []; }
}

export function saveRoutingLog(log: RoutingEvent[]): void {
  writeJSON(ROUTING_LOG_KEY, log.slice(0, ROUTING_LOG_MAX_ENTRIES));
}

export function clearRoutingLog(): void {
  remove(ROUTING_LOG_KEY);
}
