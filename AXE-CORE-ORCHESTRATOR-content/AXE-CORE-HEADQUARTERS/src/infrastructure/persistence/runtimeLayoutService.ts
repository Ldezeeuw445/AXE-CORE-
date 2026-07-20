/**
 * runtimeLayoutService.ts
 * ------------------------------------------------------------------
 * Persists node positions for the Runtime workspace canvas so the
 * layout survives reloads. Reuses the existing user_settings
 * key/value Supabase table via userSettingsService rather than adding
 * a dedicated table.
 */
import { saveSetting, loadSetting } from '@/infrastructure/persistence/userSettingsService';

export interface NodePosition {
  x: number;
  y: number;
}

const POSITIONS_KEY = 'axe_runtime_node_positions';

export async function loadNodePositions(): Promise<Record<string, NodePosition>> {
  return loadSetting<Record<string, NodePosition>>(POSITIONS_KEY, {});
}

export async function saveNodePositions(positions: Record<string, NodePosition>): Promise<void> {
  await saveSetting(POSITIONS_KEY, positions);
}
